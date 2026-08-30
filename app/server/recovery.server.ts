import { and, eq, gt, isNull } from "drizzle-orm";
import { RECOVERY_CODE_TTL_MS } from "~/lib/constants";
import { humanCode, newId, sha256Hex } from "~/lib/id";
import { destroyAllUserSessions } from "./auth.server";
import type { Db } from "./db/client.server";
import {
  accountRecoveryCodes,
  organizationMemberships,
  organizations,
  recoveryRequests,
  users,
} from "./db/schema";
import { notify, notifyMany } from "./notifications.server";
import { getManagerUserIds } from "./orgs.server";

export class RecoveryError extends Error {}

/**
 * 復旧依頼（未認証）。メールが実在ユーザーに一致し、`open` の結社に所属していれば
 * 各結社に pending の依頼行を作り、その結社の管理者へ通知する。
 * レスポンスはメールの実在有無を漏らさない（呼び出し側で常に「受け付けました」を返す）。
 */
export async function createRecoveryRequest(db: Db, email: string, note: string | undefined) {
  const user = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .get();
  if (user?.status !== "active") return;

  const orgs = await db
    .select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(and(eq(organizationMemberships.userId, user.id), eq(organizations.status, "open")))
    .all();

  for (const { organizationId } of orgs) {
    const existing = await db
      .select({ id: recoveryRequests.id })
      .from(recoveryRequests)
      .where(
        and(
          eq(recoveryRequests.userId, user.id),
          eq(recoveryRequests.organizationId, organizationId),
          eq(recoveryRequests.status, "pending"),
        ),
      )
      .get();
    if (existing) continue;

    await db.insert(recoveryRequests).values({
      id: newId(),
      userId: user.id,
      organizationId,
      note: note ?? null,
    });
    await notifyMany(db, await getManagerUserIds(db, organizationId), "recovery_requested", {
      organizationId,
      userId: user.id,
    });
  }
}

export async function listRecoveryRequests(db: Db, orgId: string) {
  return db
    .select({
      id: recoveryRequests.id,
      userId: recoveryRequests.userId,
      haigo: users.haigo,
      email: users.email,
      note: recoveryRequests.note,
      createdAt: recoveryRequests.createdAt,
    })
    .from(recoveryRequests)
    .innerJoin(users, eq(users.id, recoveryRequests.userId))
    .where(and(eq(recoveryRequests.organizationId, orgId), eq(recoveryRequests.status, "pending")))
    .orderBy(recoveryRequests.createdAt)
    .all();
}

interface IssueArgs {
  targetUserId: string;
  issuedByUserId: string;
  via: "organization_admin" | "system_admin";
  organizationId: string | null;
  issuerIp: string | null;
}

/** 復旧コードを発行し、**生コードを一度だけ返す**。権限判定は呼び出し側。 */
export async function issueRecoveryCode(db: Db, args: IssueArgs): Promise<string> {
  const target = await db
    .select({ id: users.id, status: users.status, haigo: users.haigo })
    .from(users)
    .where(eq(users.id, args.targetUserId))
    .get();
  if (!target) throw new RecoveryError("対象ユーザーが見つかりません");
  if (target.status !== "active") throw new RecoveryError("対象アカウントは利用できません");

  // 既存の未使用コードを失効
  await db
    .delete(accountRecoveryCodes)
    .where(
      and(eq(accountRecoveryCodes.userId, args.targetUserId), isNull(accountRecoveryCodes.usedAt)),
    );

  const code = humanCode();
  await db.insert(accountRecoveryCodes).values({
    id: newId(),
    userId: args.targetUserId,
    codeHash: await sha256Hex(code.replace(/-/g, "")),
    issuedBy: args.issuedByUserId,
    issuedVia: args.via,
    organizationId: args.organizationId,
    issuerIp: args.issuerIp,
    expiresAt: new Date(Date.now() + RECOVERY_CODE_TTL_MS),
  });

  // 関連する pending 依頼を handled に
  if (args.organizationId) {
    await db
      .update(recoveryRequests)
      .set({ status: "handled", handledBy: args.issuedByUserId, handledAt: new Date() })
      .where(
        and(
          eq(recoveryRequests.userId, args.targetUserId),
          eq(recoveryRequests.organizationId, args.organizationId),
          eq(recoveryRequests.status, "pending"),
        ),
      );
  }

  // 通知：対象本人 + 同結社の他管理者
  await notify(db, {
    userId: args.targetUserId,
    type: "recovery_code_issued",
    payload: { organizationId: args.organizationId },
  });
  if (args.organizationId) {
    const others = (await getManagerUserIds(db, args.organizationId)).filter(
      (id) => id !== args.issuedByUserId,
    );
    await notifyMany(db, others, "recovery_code_issued", {
      organizationId: args.organizationId,
      userId: args.targetUserId,
    });
  }

  return code;
}

/** コード検証。成功時は対象ユーザー + コード行 ID を返す。失敗は一律 RecoveryError。 */
export async function verifyRecoveryCode(db: Db, email: string, normalizedCode: string) {
  const user = await db
    .select({ id: users.id, status: users.status, haigo: users.haigo })
    .from(users)
    .where(eq(users.email, email))
    .get();
  const codeHash = await sha256Hex(normalizedCode);
  if (user?.status !== "active") throw new RecoveryError("コードが無効です");

  const row = await db
    .select()
    .from(accountRecoveryCodes)
    .where(
      and(
        eq(accountRecoveryCodes.userId, user.id),
        eq(accountRecoveryCodes.codeHash, codeHash),
        isNull(accountRecoveryCodes.usedAt),
        gt(accountRecoveryCodes.expiresAt, new Date()),
      ),
    )
    .get();
  if (!row) throw new RecoveryError("コードが無効です");

  return { user, codeId: row.id, organizationId: row.organizationId, issuedBy: row.issuedBy };
}

/** 再登録セレモニー成功後：コードを used に、全セッション失効、通知。 */
export async function finalizeRecovery(
  db: Db,
  args: {
    codeId: string;
    userId: string;
    ip: string | null;
    userAgent: string | null;
  },
) {
  await db
    .update(accountRecoveryCodes)
    .set({ usedAt: new Date(), usedIp: args.ip, usedUserAgent: args.userAgent })
    .where(eq(accountRecoveryCodes.id, args.codeId));

  await destroyAllUserSessions(db, args.userId);

  const code = await db
    .select({
      issuedBy: accountRecoveryCodes.issuedBy,
      organizationId: accountRecoveryCodes.organizationId,
    })
    .from(accountRecoveryCodes)
    .where(eq(accountRecoveryCodes.id, args.codeId))
    .get();
  if (code) {
    await notify(db, {
      userId: code.issuedBy,
      type: "recovery_code_used",
      payload: { userId: args.userId, organizationId: code.organizationId },
    });
    if (code.organizationId) {
      const managers = (await getManagerUserIds(db, code.organizationId)).filter(
        (id) => id !== code.issuedBy,
      );
      await notifyMany(db, managers, "recovery_code_used", {
        userId: args.userId,
        organizationId: code.organizationId,
      });
    }
  }
}

/** 呼び出し側で「発行できるか」を判定するためのヘルパ。対象が当該結社の現メンバーか。 */
export async function isCurrentMember(db: Db, orgId: string, userId: string): Promise<boolean> {
  const m = await db
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, orgId),
        eq(organizationMemberships.userId, userId),
      ),
    )
    .get();
  return !!m;
}
