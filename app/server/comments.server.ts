import { and, asc, eq } from "drizzle-orm";
import { isAtOrAfter } from "~/lib/constants";
import { newId } from "~/lib/id";
import type { Db } from "./db/client.server";
import { comments, type Kukai, users } from "./db/schema";
import { KukaiError } from "./kukai.server";

export async function addComment(
  db: Db,
  k: Kukai,
  userId: string,
  submissionId: string,
  body: string,
) {
  if (k.phase !== "selection" && k.phase !== "commenting") {
    throw new KukaiError("いまはコメントを投稿できません");
  }
  await db.insert(comments).values({
    id: newId(),
    kukaiId: k.id,
    submissionId,
    authorUserId: userId,
    body,
  });
}

export async function deleteOwnComment(db: Db, k: Kukai, userId: string, commentId: string) {
  const c = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.authorUserId, userId)))
    .get();
  if (!c || c.kukaiId !== k.id) throw new KukaiError("対象のコメントが見つかりません");
  await db.delete(comments).where(eq(comments.id, commentId));
}

/**
 * コメント一覧。
 * - 結果発表前（selection / selection_closed）：自分のコメントのみ
 * - 結果発表以降：全員のコメント（俳号付き）
 */
export async function listComments(
  db: Db,
  k: Kukai,
  viewerUserId: string | null,
): Promise<Record<string, { id: string; body: string; haigo: string | null; mine: boolean }[]>> {
  const revealed = isAtOrAfter(k.phase, "result");

  const rows = await db
    .select({
      id: comments.id,
      submissionId: comments.submissionId,
      body: comments.body,
      authorUserId: comments.authorUserId,
      haigo: users.haigo,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorUserId))
    .where(eq(comments.kukaiId, k.id))
    .orderBy(asc(comments.createdAt))
    .all();

  const out: Record<string, { id: string; body: string; haigo: string | null; mine: boolean }[]> =
    {};
  for (const r of rows) {
    const mine = viewerUserId != null && r.authorUserId === viewerUserId;
    if (!revealed && !mine) continue;
    let list = out[r.submissionId];
    if (!list) {
      list = [];
      out[r.submissionId] = list;
    }
    list.push({
      id: r.id,
      body: r.body,
      haigo: revealed || mine ? r.haigo : null,
      mine,
    });
  }
  return out;
}
