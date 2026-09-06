import { and, eq, gt } from "drizzle-orm";
import { redirect } from "react-router";
import { GUEST_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME, SESSION_TTL_MS } from "~/lib/constants";
import { newToken, sha256Hex } from "~/lib/id";
import type { Db } from "./db/client.server";
import { sessions, type User, users } from "./db/schema";

export interface MemberAuth {
  kind: "member";
  user: User;
  sessionId: string;
}

export interface GuestAuth {
  kind: "guest";
  sessionId: string;
}

/** 会員セッションを発行し、Set-Cookie 文字列を返す */
export async function createMemberSession(
  db: Db,
  userId: string,
  request: Request,
): Promise<{ setCookie: string; expiresAt: Date }> {
  const token = newToken();
  const id = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id,
    kind: "member",
    userId,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    expiresAt,
  });
  return { setCookie: buildSessionCookie(token, expiresAt), expiresAt };
}

export function buildSessionCookie(
  token: string,
  expiresAt: Date,
  name = SESSION_COOKIE_NAME,
): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return [
    `${name}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export function buildClearSessionCookie(name = SESSION_COOKIE_NAME): string {
  return [`${name}=`, "Path=/", "HttpOnly", "Secure", "SameSite=Lax", "Max-Age=0"].join("; ");
}

function readCookie(name: string, request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      const value = part.slice(eq + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

export function readSessionToken(request: Request): string | null {
  return readCookie(SESSION_COOKIE_NAME, request);
}

export function readGuestSessionToken(request: Request): string | null {
  return readCookie(GUEST_SESSION_COOKIE_NAME, request);
}

/** Cookie からセッションを解決する。無効・期限切れ・停止アカウントなら null。 */
export async function getAuth(db: Db, request: Request): Promise<MemberAuth | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .get();
  if (!row?.user) return null;
  if (row.user.status === "suspended") return null;
  return { kind: "member", user: row.user, sessionId: row.session.id };
}

/** 認証必須の loader / action 用。未認証なら /login へリダイレクトする。 */
export async function requireAuth(db: Db, request: Request): Promise<MemberAuth> {
  const auth = await getAuth(db, request);
  if (!auth) {
    const url = new URL(request.url);
    const to = url.pathname + url.search;
    throw redirect(to === "/" ? "/login" : `/login?next=${encodeURIComponent(to)}`);
  }
  return auth;
}

export async function destroySession(db: Db, sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function destroyAllUserSessions(db: Db, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** ゲストセッションを Cookie から解決する。無効・期限切れなら null。 */
export async function getGuestAuth(db: Db, request: Request): Promise<GuestAuth | null> {
  const token = readGuestSessionToken(request);
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.kind, "guest"), gt(sessions.expiresAt, new Date())))
    .get();
  return row ? { kind: "guest", sessionId: row.id } : null;
}

/**
 * ゲストセッションを解決・作成する（`/guest` の参加処理から呼ぶ）。
 * 既存セッションがあれば有効期限を必要に応じて延長し、同じ Cookie を再発行する。
 * 無ければ新規発行する。有効期限は参加に使ったゲストコードの期限（呼び出し側が渡す）。
 */
export async function getOrCreateGuestSession(
  db: Db,
  request: Request,
  minExpiresAt: Date,
): Promise<{ sessionId: string; setCookie: string }> {
  const existingToken = readGuestSessionToken(request);
  if (existingToken) {
    const id = await sha256Hex(existingToken);
    const row = await db
      .select({ id: sessions.id, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(
        and(eq(sessions.id, id), eq(sessions.kind, "guest"), gt(sessions.expiresAt, new Date())),
      )
      .get();
    if (row) {
      const expiresAt = minExpiresAt > row.expiresAt ? minExpiresAt : row.expiresAt;
      if (expiresAt.getTime() !== row.expiresAt.getTime()) {
        await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
      }
      return {
        sessionId: id,
        setCookie: buildSessionCookie(existingToken, expiresAt, GUEST_SESSION_COOKIE_NAME),
      };
    }
  }

  const token = newToken();
  const id = await sha256Hex(token);
  await db.insert(sessions).values({
    id,
    kind: "guest",
    userId: null,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    expiresAt: minExpiresAt,
  });
  return {
    sessionId: id,
    setCookie: buildSessionCookie(token, minExpiresAt, GUEST_SESSION_COOKIE_NAME),
  };
}
