import { and, asc, eq, isNull, ne, or } from "drizzle-orm";
import { newToken } from "~/lib/id";
import type { Db } from "./db/client.server";
import { guestParticipants, type Kukai, submissions, users } from "./db/schema";
import { type Actor, KukaiError } from "./kukai.server";

function assertSubmissionPhase(k: Kukai) {
  if (k.phase !== "submission") throw new KukaiError("いまは投句期間ではありません");
}

function authoredBy(actor: Actor) {
  return actor.kind === "user"
    ? eq(submissions.authorUserId, actor.id)
    : eq(submissions.authorGuestId, actor.id);
}

/** actor が作者ではない句（NULL の列も除外に含めないよう IS NULL OR <> で判定）。 */
function notAuthoredBy(actor: Actor) {
  return actor.kind === "user"
    ? or(isNull(submissions.authorUserId), ne(submissions.authorUserId, actor.id))
    : or(isNull(submissions.authorGuestId), ne(submissions.authorGuestId, actor.id));
}

export async function listMySubmissions(db: Db, kukaiId: string, actor: Actor) {
  return db
    .select({
      id: submissions.id,
      content: submissions.content,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .where(and(eq(submissions.kukaiId, kukaiId), authoredBy(actor)))
    .orderBy(asc(submissions.createdAt))
    .all();
}

export async function addSubmission(db: Db, k: Kukai, actor: Actor, content: string) {
  assertSubmissionPhase(k);
  const mine = await listMySubmissions(db, k.id, actor);
  if (mine.length >= k.submissionsPerUser) {
    throw new KukaiError(`投句できるのは ${k.submissionsPerUser} 句までです`);
  }
  await db.insert(submissions).values({
    id: newToken(12),
    kukaiId: k.id,
    authorUserId: actor.kind === "user" ? actor.id : null,
    authorGuestId: actor.kind === "guest" ? actor.id : null,
    content,
    sortKey: newToken(16),
  });
}

async function getOwnSubmission(db: Db, submissionId: string, actor: Actor) {
  return db
    .select()
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), authoredBy(actor)))
    .get();
}

export async function updateSubmission(
  db: Db,
  k: Kukai,
  submissionId: string,
  actor: Actor,
  content: string,
) {
  assertSubmissionPhase(k);
  const s = await getOwnSubmission(db, submissionId, actor);
  if (!s || s.kukaiId !== k.id) throw new KukaiError("対象の投句が見つかりません");
  await db
    .update(submissions)
    .set({ content, updatedAt: new Date() })
    .where(eq(submissions.id, submissionId));
}

export async function deleteSubmission(db: Db, k: Kukai, submissionId: string, actor: Actor) {
  assertSubmissionPhase(k);
  const s = await getOwnSubmission(db, submissionId, actor);
  if (!s || s.kukaiId !== k.id) throw new KukaiError("対象の投句が見つかりません");
  await db.delete(submissions).where(eq(submissions.id, submissionId));
}

// ---- 主催者向け ---------------------------------------------------

export async function listSubmissionsForOrganizer(db: Db, kukaiId: string) {
  const rows = await db
    .select({
      id: submissions.id,
      content: submissions.content,
      authorHaigo: users.haigo,
      authorGuestName: guestParticipants.displayName,
      isHidden: submissions.isHidden,
      hiddenReason: submissions.hiddenReason,
    })
    .from(submissions)
    .leftJoin(users, eq(users.id, submissions.authorUserId))
    .leftJoin(guestParticipants, eq(guestParticipants.id, submissions.authorGuestId))
    .where(eq(submissions.kukaiId, kukaiId))
    .orderBy(asc(submissions.createdAt))
    .all();
  return rows.map((r) => ({ ...r, authorHaigo: r.authorHaigo ?? r.authorGuestName }));
}

export async function setSubmissionHidden(
  db: Db,
  kukaiId: string,
  submissionId: string,
  hidden: boolean,
  byUserId: string,
  reason: string | null,
) {
  const s = await db
    .select({ id: submissions.id, kukaiId: submissions.kukaiId })
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .get();
  if (!s || s.kukaiId !== kukaiId) throw new KukaiError("対象の投句が見つかりません");
  await db
    .update(submissions)
    .set({
      isHidden: hidden,
      hiddenBy: hidden ? byUserId : null,
      hiddenReason: hidden ? reason : null,
      updatedAt: new Date(),
    })
    .where(eq(submissions.id, submissionId));
}

// ---- 選句シート -------------------------------------------------

/** 選句対象の句（自句・非表示を除外、sort_key 順）。作者はここでは返さない。 */
export async function getSelectionSheet(db: Db, kukaiId: string, actor: Actor) {
  return db
    .select({ id: submissions.id, content: submissions.content })
    .from(submissions)
    .where(
      and(eq(submissions.kukaiId, kukaiId), eq(submissions.isHidden, false), notAuthoredBy(actor)),
    )
    .orderBy(asc(submissions.sortKey))
    .all();
}

/** 集計・結果表示に使う（非表示を除外） */
export async function listVisibleSubmissions(db: Db, kukaiId: string) {
  const rows = await db
    .select({
      id: submissions.id,
      content: submissions.content,
      authorUserId: submissions.authorUserId,
      authorHaigo: users.haigo,
      authorGuestName: guestParticipants.displayName,
      createdAt: submissions.createdAt,
    })
    .from(submissions)
    .leftJoin(users, eq(users.id, submissions.authorUserId))
    .leftJoin(guestParticipants, eq(guestParticipants.id, submissions.authorGuestId))
    .where(and(eq(submissions.kukaiId, kukaiId), eq(submissions.isHidden, false)))
    .orderBy(asc(submissions.createdAt))
    .all();
  return rows.map((r) => ({ ...r, authorHaigo: r.authorHaigo ?? r.authorGuestName }));
}
