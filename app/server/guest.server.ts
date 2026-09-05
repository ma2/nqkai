import { and, desc, eq } from "drizzle-orm";
import { GUEST_CODE_TTL_MONTHS } from "~/lib/constants";
import { newId, newToken } from "~/lib/id";
import type { Db } from "./db/client.server";
import {
  type GuestCode,
  type GuestParticipant,
  guestCodes,
  guestParticipants,
  type Kukai,
  kukai,
  organizations,
} from "./db/schema";
import { KukaiError } from "./kukai.server";

/** 発行時刻 + n ヶ月（カレンダー月基準） */
function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

/** 主催者向け：句会のゲストコード発行（`allow_guest` の句会のみ）。 */
export async function issueGuestCode(
  db: Db,
  k: Kukai,
  createdBy: string,
  maxUses: number | null,
): Promise<GuestCode> {
  if (!k.allowGuest) throw new KukaiError("この句会はゲスト参加を許可していません");
  const now = new Date();
  const row = {
    id: newId(),
    kukaiId: k.id,
    code: newToken(16),
    maxUses,
    usedCount: 0,
    expiresAt: addMonths(now, GUEST_CODE_TTL_MONTHS),
    createdBy,
    createdAt: now,
    revokedAt: null,
  } satisfies typeof guestCodes.$inferInsert;
  await db.insert(guestCodes).values(row);
  return row as GuestCode;
}

export async function listGuestCodesForKukai(db: Db, kukaiId: string) {
  return db
    .select()
    .from(guestCodes)
    .where(eq(guestCodes.kukaiId, kukaiId))
    .orderBy(desc(guestCodes.createdAt))
    .all();
}

export async function revokeGuestCode(db: Db, kukaiId: string, codeId: string): Promise<void> {
  const c = await db
    .select({ id: guestCodes.id, kukaiId: guestCodes.kukaiId })
    .from(guestCodes)
    .where(eq(guestCodes.id, codeId))
    .get();
  if (!c || c.kukaiId !== kukaiId) throw new KukaiError("対象のコードが見つかりません");
  await db.update(guestCodes).set({ revokedAt: new Date() }).where(eq(guestCodes.id, codeId));
}

export interface GuestCodeCheck {
  ok: boolean;
  reason?: "not_found" | "revoked" | "expired" | "exhausted";
  code?: GuestCode;
  kukai?: Kukai;
  orgName?: string;
}

/** `/guest?code=` の表示・参加処理向け：コードの有効性と対象句会を引く。 */
export async function checkGuestCode(db: Db, rawCode: string): Promise<GuestCodeCheck> {
  const row = await db
    .select({ code: guestCodes, kukai: kukai, orgName: organizations.name })
    .from(guestCodes)
    .innerJoin(kukai, eq(kukai.id, guestCodes.kukaiId))
    .innerJoin(organizations, eq(organizations.id, kukai.organizationId))
    .where(eq(guestCodes.code, rawCode))
    .get();
  if (!row) return { ok: false, reason: "not_found" };
  if (row.code.revokedAt != null) return { ok: false, reason: "revoked" };
  if (row.code.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  if (row.code.maxUses != null && row.code.usedCount >= row.code.maxUses) {
    return { ok: false, reason: "exhausted" };
  }
  return { ok: true, code: row.code, kukai: row.kukai, orgName: row.orgName };
}

export function guestCodeErrorMessage(reason: GuestCodeCheck["reason"]): string {
  switch (reason) {
    case "revoked":
      return "このコードは失効しています";
    case "expired":
      return "このコードは期限切れです";
    case "exhausted":
      return "このコードは使用上限に達しています";
    default:
      return "コードが見つかりません";
  }
}

/**
 * ゲストとして句会に参加する。同じセッションから同じ句会へ再度参加した場合は
 * 既存の `guest_participants` 行を返す（重複作成しない）。
 */
export async function joinKukaiAsGuest(
  db: Db,
  code: GuestCode,
  k: Kukai,
  sessionId: string,
): Promise<GuestParticipant> {
  const existing = await db
    .select()
    .from(guestParticipants)
    .where(and(eq(guestParticipants.sessionId, sessionId), eq(guestParticipants.kukaiId, k.id)))
    .get();
  if (existing) {
    await db
      .update(guestParticipants)
      .set({ lastSeenAt: new Date() })
      .where(eq(guestParticipants.id, existing.id));
    return existing;
  }

  // 句会内連番の表示名。まれな同時参加での重複は一度だけ再試行する。
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await db
      .select({ id: guestParticipants.id })
      .from(guestParticipants)
      .where(eq(guestParticipants.kukaiId, k.id))
      .all();
    const row = {
      id: newId(),
      sessionId,
      kukaiId: k.id,
      guestCodeId: code.id,
      displayName: `ゲスト${current.length + 1}`,
      canSubmit: k.guestCanSubmit,
      canSelect: k.guestCanSelect,
      canComment: k.guestCanComment,
      createdAt: new Date(),
      lastSeenAt: null,
    } satisfies typeof guestParticipants.$inferInsert;
    try {
      await db.insert(guestParticipants).values(row);
      await db
        .update(guestCodes)
        .set({ usedCount: code.usedCount + 1 })
        .where(eq(guestCodes.id, code.id));
      return row as GuestParticipant;
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  throw new KukaiError("参加処理に失敗しました。もう一度お試しください");
}
