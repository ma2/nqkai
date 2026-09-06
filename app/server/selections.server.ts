import { and, eq } from "drizzle-orm";
import type { SelectionKind } from "~/lib/constants";
import { newId } from "~/lib/id";
import type { Db } from "./db/client.server";
import { type Kukai, selections, submissions } from "./db/schema";
import { type Actor, KukaiError } from "./kukai.server";

function limitFor(k: Kukai, kind: SelectionKind): number {
  return kind === "special" ? k.specialCount : kind === "regular" ? k.regularCount : k.reverseCount;
}

function selectedBy(actor: Actor) {
  return actor.kind === "user"
    ? eq(selections.selectorUserId, actor.id)
    : eq(selections.selectorGuestId, actor.id);
}

function isOwnSubmission(
  actor: Actor,
  s: { authorUserId: string | null; authorGuestId: string | null },
) {
  return actor.kind === "user" ? s.authorUserId === actor.id : s.authorGuestId === actor.id;
}

export async function listMySelections(
  db: Db,
  kukaiId: string,
  actor: Actor,
): Promise<Record<string, SelectionKind>> {
  const rows = await db
    .select({ submissionId: selections.submissionId, kind: selections.kind })
    .from(selections)
    .where(and(eq(selections.kukaiId, kukaiId), selectedBy(actor)))
    .all();
  return Object.fromEntries(rows.map((r) => [r.submissionId, r.kind]));
}

export async function setSelection(
  db: Db,
  k: Kukai,
  actor: Actor,
  submissionId: string,
  kind: SelectionKind,
) {
  if (k.phase !== "selection") throw new KukaiError("いまは選句期間ではありません");

  const s = await db
    .select({
      authorUserId: submissions.authorUserId,
      authorGuestId: submissions.authorGuestId,
      isHidden: submissions.isHidden,
    })
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), eq(submissions.kukaiId, k.id)))
    .get();
  if (!s || s.isHidden) throw new KukaiError("対象の句が見つかりません");
  if (isOwnSubmission(actor, s)) throw new KukaiError("自分の句は選べません");

  const current = await db
    .select()
    .from(selections)
    .where(and(eq(selections.submissionId, submissionId), selectedBy(actor)))
    .get();
  if (current?.kind === kind) return;

  // 種別ごとの上限（変更対象の1件は除いて数える）
  const mine = await listMySelections(db, k.id, actor);
  const usedOfKind = Object.entries(mine).filter(
    ([sid, ki]) => ki === kind && sid !== submissionId,
  ).length;
  if (usedOfKind >= limitFor(k, kind)) {
    throw new KukaiError(`その選の上限（${limitFor(k, kind)}）に達しています`);
  }

  if (current) {
    await db.update(selections).set({ kind }).where(eq(selections.id, current.id));
  } else {
    await db.insert(selections).values({
      id: newId(),
      kukaiId: k.id,
      submissionId,
      selectorUserId: actor.kind === "user" ? actor.id : null,
      selectorGuestId: actor.kind === "guest" ? actor.id : null,
      kind,
    });
  }
}

export async function clearSelection(db: Db, k: Kukai, actor: Actor, submissionId: string) {
  if (k.phase !== "selection") throw new KukaiError("いまは選句期間ではありません");
  await db
    .delete(selections)
    .where(and(eq(selections.submissionId, submissionId), selectedBy(actor)));
}
