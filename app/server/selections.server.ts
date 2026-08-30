import { and, eq } from "drizzle-orm";
import type { SelectionKind } from "~/lib/constants";
import { newId } from "~/lib/id";
import type { Db } from "./db/client.server";
import { type Kukai, selections, submissions } from "./db/schema";
import { KukaiError } from "./kukai.server";

function limitFor(k: Kukai, kind: SelectionKind): number {
  return kind === "special" ? k.specialCount : kind === "regular" ? k.regularCount : k.reverseCount;
}

export async function listMySelections(
  db: Db,
  kukaiId: string,
  userId: string,
): Promise<Record<string, SelectionKind>> {
  const rows = await db
    .select({ submissionId: selections.submissionId, kind: selections.kind })
    .from(selections)
    .where(and(eq(selections.kukaiId, kukaiId), eq(selections.selectorUserId, userId)))
    .all();
  return Object.fromEntries(rows.map((r) => [r.submissionId, r.kind]));
}

export async function setSelection(
  db: Db,
  k: Kukai,
  userId: string,
  submissionId: string,
  kind: SelectionKind,
) {
  if (k.phase !== "selection") throw new KukaiError("いまは選句期間ではありません");

  const s = await db
    .select({ authorUserId: submissions.authorUserId, isHidden: submissions.isHidden })
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), eq(submissions.kukaiId, k.id)))
    .get();
  if (!s || s.isHidden) throw new KukaiError("対象の句が見つかりません");
  if (s.authorUserId === userId) throw new KukaiError("自分の句は選べません");

  const current = await db
    .select()
    .from(selections)
    .where(and(eq(selections.submissionId, submissionId), eq(selections.selectorUserId, userId)))
    .get();
  if (current?.kind === kind) return;

  // 種別ごとの上限（変更対象の1件は除いて数える）
  const mine = await listMySelections(db, k.id, userId);
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
      selectorUserId: userId,
      kind,
    });
  }
}

export async function clearSelection(db: Db, k: Kukai, userId: string, submissionId: string) {
  if (k.phase !== "selection") throw new KukaiError("いまは選句期間ではありません");
  await db
    .delete(selections)
    .where(and(eq(selections.submissionId, submissionId), eq(selections.selectorUserId, userId)));
}
