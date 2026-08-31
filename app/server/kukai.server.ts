import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  isAtOrAfter,
  KUKAI_PHASES,
  type KukaiPhase,
  type OrgRole,
  phaseIndex,
} from "~/lib/constants";
import { newId } from "~/lib/id";
import type { KukaiSettingsInput } from "~/lib/schemas";
import type { Db } from "./db/client.server";
import {
  type Kukai,
  kukai,
  kukaiPhaseEvents,
  type Organization,
  organizationMemberships,
  organizations,
  submissions,
  users,
} from "./db/schema";
import { notifyMany } from "./notifications.server";
import { getOrgMemberUserIds } from "./orgs.server";

export class KukaiError extends Error {}

export interface KukaiContext {
  kukai: Kukai;
  organization: Organization;
  orgRole: OrgRole | null;
  isOrganizer: boolean;
  isSystemAdmin: boolean;
  /** 閲覧可能か */
  canView: boolean;
  /** フェーズ制御・設定変更・句の非表示（主催者 or システム管理者） */
  canManage: boolean;
  /** 論理削除・復活（上記 + 結社管理者・副管理者） */
  canManageDeletion: boolean;
  /** 投句・選句・コメントの対象になれるか（結社メンバー） */
  canParticipate: boolean;
}

export async function loadKukaiContext(
  db: Db,
  kukaiId: string,
  userId: string | null,
  isSystemAdmin: boolean,
): Promise<KukaiContext> {
  const row = await db
    .select({ k: kukai, o: organizations })
    .from(kukai)
    .innerJoin(organizations, eq(organizations.id, kukai.organizationId))
    .where(eq(kukai.id, kukaiId))
    .get();
  if (!row) throw new Response("句会が見つかりません", { status: 404 });

  let orgRole: OrgRole | null = null;
  if (userId) {
    const m = await db
      .select({ role: organizationMemberships.role })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, row.o.id),
          eq(organizationMemberships.userId, userId),
        ),
      )
      .get();
    orgRole = m?.role ?? null;
  }

  const isOrganizer = userId != null && row.k.organizerId === userId;
  const canManage = isOrganizer || isSystemAdmin;
  const canManageDeletion = canManage || orgRole === "admin" || orgRole === "deputy_admin";

  const orgOpen = row.o.status === "open";
  const publicClosed = row.k.visibility === "public" && row.k.phase === "closed";
  const canView =
    (orgOpen || isSystemAdmin) &&
    (orgRole != null || isOrganizer || isSystemAdmin || (orgOpen && publicClosed)) &&
    (row.k.deletedAt == null || canManageDeletion);

  if (!canView) throw new Response("句会が見つかりません", { status: 404 });

  return {
    kukai: row.k,
    organization: row.o,
    orgRole,
    isOrganizer,
    isSystemAdmin,
    canView,
    canManage,
    canManageDeletion,
    canParticipate: orgRole != null && row.o.status === "open" && row.k.deletedAt == null,
  };
}

export function assertManage(ctx: KukaiContext): void {
  if (!ctx.canManage) throw new Response("主催者のみ可能な操作です", { status: 403 });
}

// ---- 作成・設定 ---------------------------------------------------

export async function createKukai(
  db: Db,
  organizationId: string,
  organizerId: string,
  input: KukaiSettingsInput,
): Promise<string> {
  const id = newId();
  await db.insert(kukai).values({
    id,
    organizationId,
    organizerId,
    name: input.name,
    description: input.description ?? "",
    theme: input.theme ?? "",
    submissionsPerUser: input.submissionsPerUser,
    specialCount: input.specialCount,
    regularCount: input.regularCount,
    reverseCount: input.reverseCount,
    specialPoints: input.specialPoints,
    regularPoints: input.regularPoints,
    reversePoints: input.reversePoints,
    visibility: input.visibility,
    scheduledSubmissionStartAt: input.scheduledSubmissionStartAt,
    scheduledSubmissionEndAt: input.scheduledSubmissionEndAt,
    scheduledSelectionStartAt: input.scheduledSelectionStartAt,
    scheduledSelectionEndAt: input.scheduledSelectionEndAt,
    scheduledResultAt: input.scheduledResultAt,
    scheduledCommentStartAt: input.scheduledCommentStartAt,
    scheduledCommentEndAt: input.scheduledCommentEndAt,
  });
  return id;
}

export async function updateKukaiSettings(db: Db, k: Kukai, input: KukaiSettingsInput) {
  const beforeSubmission = phaseIndex(k.phase) < phaseIndex("submission");
  const patch: Partial<typeof kukai.$inferInsert> = {
    name: input.name,
    description: input.description ?? "",
    theme: input.theme ?? "",
    visibility: input.visibility,
    scheduledSubmissionStartAt: input.scheduledSubmissionStartAt,
    scheduledSubmissionEndAt: input.scheduledSubmissionEndAt,
    scheduledSelectionStartAt: input.scheduledSelectionStartAt,
    scheduledSelectionEndAt: input.scheduledSelectionEndAt,
    scheduledResultAt: input.scheduledResultAt,
    scheduledCommentStartAt: input.scheduledCommentStartAt,
    scheduledCommentEndAt: input.scheduledCommentEndAt,
    updatedAt: new Date(),
  };
  if (beforeSubmission) {
    patch.submissionsPerUser = input.submissionsPerUser;
    patch.specialCount = input.specialCount;
    patch.regularCount = input.regularCount;
    patch.reverseCount = input.reverseCount;
    patch.specialPoints = input.specialPoints;
    patch.regularPoints = input.regularPoints;
    patch.reversePoints = input.reversePoints;
  }
  await db.update(kukai).set(patch).where(eq(kukai.id, k.id));
}

// ---- フェーズ遷移 -----------------------------------------------

async function reshuffleSortKeys(db: Db, kukaiId: string) {
  await db.run(
    sql`UPDATE ${submissions} SET sort_key = lower(hex(randomblob(16))) WHERE kukai_id = ${kukaiId}`,
  );
}

export async function transitionPhase(
  db: Db,
  k: Kukai,
  direction: "advance" | "rewind",
  actorId: string,
): Promise<KukaiPhase> {
  const idx = phaseIndex(k.phase);
  const nextIdx = direction === "advance" ? idx + 1 : idx - 1;
  if (nextIdx < 0 || nextIdx >= KUKAI_PHASES.length) {
    throw new KukaiError(direction === "advance" ? "これ以上進められません" : "これ以上戻せません");
  }
  const to = KUKAI_PHASES[nextIdx]!;

  if (direction === "advance" && to === "submission_closed") {
    await reshuffleSortKeys(db, k.id);
  }

  await db.update(kukai).set({ phase: to, updatedAt: new Date() }).where(eq(kukai.id, k.id));
  await db.insert(kukaiPhaseEvents).values({
    id: newId(),
    kukaiId: k.id,
    fromPhase: k.phase,
    toPhase: to,
    action: direction,
    actorId,
  });

  const members = (await getOrgMemberUserIds(db, k.organizationId)).filter((id) => id !== actorId);
  await notifyMany(db, members, "phase_changed", {
    kukaiId: k.id,
    kukaiName: k.name,
    fromPhase: k.phase,
    phase: to,
  });

  return to;
}

const SCHEDULE_FIELDS = {
  submissionStart: "scheduledSubmissionStartAt",
  submissionEnd: "scheduledSubmissionEndAt",
  selectionStart: "scheduledSelectionStartAt",
  selectionEnd: "scheduledSelectionEndAt",
  result: "scheduledResultAt",
  commentStart: "scheduledCommentStartAt",
  commentEnd: "scheduledCommentEndAt",
} as const;

export async function extendSchedule(
  db: Db,
  k: Kukai,
  field: keyof typeof SCHEDULE_FIELDS,
  value: Date | null,
  actorId: string,
) {
  const column = SCHEDULE_FIELDS[field];
  await db
    .update(kukai)
    .set({ [column]: value, updatedAt: new Date() })
    .where(eq(kukai.id, k.id));
  await db.insert(kukaiPhaseEvents).values({
    id: newId(),
    kukaiId: k.id,
    fromPhase: k.phase,
    toPhase: k.phase,
    action: "extend",
    actorId,
    note: `${field} = ${value ? value.toISOString() : "(なし)"}`,
  });
}

export async function revealAuthors(db: Db, k: Kukai, actorId: string) {
  if (!isAtOrAfter(k.phase, "result")) {
    throw new KukaiError("結果発表フェーズ以降でのみ作者を公開できます");
  }
  if (k.authorsRevealedAt) return;
  await db
    .update(kukai)
    .set({ authorsRevealedAt: new Date(), updatedAt: new Date() })
    .where(eq(kukai.id, k.id));
  await db.insert(kukaiPhaseEvents).values({
    id: newId(),
    kukaiId: k.id,
    fromPhase: k.phase,
    toPhase: k.phase,
    action: "reveal_authors",
    actorId,
  });
}

export async function setKukaiDeleted(db: Db, k: Kukai, deleted: boolean, actorId: string) {
  await db
    .update(kukai)
    .set({
      deletedAt: deleted ? new Date() : null,
      deletedBy: deleted ? actorId : null,
      updatedAt: new Date(),
    })
    .where(eq(kukai.id, k.id));
}

// ---- 一覧 ------------------------------------------------------

export async function listKukaiForOrg(db: Db, orgId: string, canSeeDeleted: boolean) {
  const rows = await db
    .select({
      id: kukai.id,
      name: kukai.name,
      phase: kukai.phase,
      theme: kukai.theme,
      visibility: kukai.visibility,
      deletedAt: kukai.deletedAt,
      organizerHaigo: users.haigo,
      createdAt: kukai.createdAt,
    })
    .from(kukai)
    .innerJoin(users, eq(users.id, kukai.organizerId))
    .where(eq(kukai.organizationId, orgId))
    .orderBy(desc(kukai.createdAt))
    .all();
  return canSeeDeleted ? rows : rows.filter((r) => r.deletedAt == null);
}

/** ポーリング用の軽量状態 */
export async function getKukaiState(db: Db, kukaiId: string) {
  const k = await db
    .select({
      phase: kukai.phase,
      authorsRevealedAt: kukai.authorsRevealedAt,
      updatedAt: kukai.updatedAt,
    })
    .from(kukai)
    .where(eq(kukai.id, kukaiId))
    .get();
  if (!k) return null;

  const subCount = await db
    .select({ n: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.kukaiId, kukaiId), eq(submissions.isHidden, false)))
    .all();

  return {
    phase: k.phase,
    authorsRevealed: k.authorsRevealedAt != null,
    updatedAt: k.updatedAt.getTime(),
    submissionCount: subCount.length,
    serverTime: Date.now(),
  };
}

/** ユーザーが会員として所属する結社の句会を引く共通クエリ（絞り込みは呼び出し側）。 */
function kukaiForUserQuery(db: Db) {
  return db
    .select({
      id: kukai.id,
      name: kukai.name,
      phase: kukai.phase,
      orgName: organizations.name,
      updatedAt: kukai.updatedAt,
    })
    .from(kukai)
    .innerJoin(organizations, eq(organizations.id, kukai.organizationId))
    .innerJoin(
      organizationMemberships,
      eq(organizationMemberships.organizationId, kukai.organizationId),
    );
}

/** 進行中（draft / closed 以外）の句会。会員として所属する結社のもの。 */
export async function listActiveKukaiForUser(db: Db, userId: string) {
  return kukaiForUserQuery(db)
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        isNull(kukai.deletedAt),
        sql`${kukai.phase} not in ('draft','closed')`,
      ),
    )
    .orderBy(desc(kukai.updatedAt))
    .all();
}

/** 終了した（closed）句会。新しい順。 */
export async function listPastKukaiForUser(db: Db, userId: string, limit = 50) {
  return kukaiForUserQuery(db)
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        isNull(kukai.deletedAt),
        eq(kukai.phase, "closed"),
      ),
    )
    .orderBy(desc(kukai.updatedAt))
    .limit(limit)
    .all();
}
