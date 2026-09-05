import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { PersonalHaikuItem } from "~/lib/export";
import type { Db } from "./db/client.server";
import { kukai, selections, submissions, users } from "./db/schema";

export interface PublicHaiku {
  haigo: string;
  publicId: string;
  items: PersonalHaikuItem[];
}

/**
 * 個人の公開俳句一覧。
 * - 作者が公開済み（`authorsRevealedAt` 設定済み）かつ削除されていない句会の、本人の句のみ。
 * - 非表示の句は除外。
 * - 得点は当該句会の点数設定で選句を合算。
 * 見つからない／停止中ユーザーは null。
 */
export async function listPublicHaiku(db: Db, publicId: string): Promise<PublicHaiku | null> {
  const user = await db
    .select({ id: users.id, haigo: users.haigo, status: users.status, publicId: users.publicId })
    .from(users)
    .where(eq(users.publicId, publicId))
    .get();
  if (user?.status !== "active") return null;

  const subRows = await db
    .select({
      id: submissions.id,
      content: submissions.content,
      kukaiId: kukai.id,
      kukaiName: kukai.name,
      theme: kukai.theme,
      resultAt: kukai.scheduledResultAt,
      kukaiUpdatedAt: kukai.updatedAt,
      specialPoints: kukai.specialPoints,
      regularPoints: kukai.regularPoints,
      reversePoints: kukai.reversePoints,
    })
    .from(submissions)
    .innerJoin(kukai, eq(kukai.id, submissions.kukaiId))
    .where(
      and(
        eq(submissions.authorUserId, user.id),
        eq(submissions.isHidden, false),
        isNull(kukai.deletedAt),
        isNotNull(kukai.authorsRevealedAt),
      ),
    )
    .orderBy(desc(kukai.scheduledResultAt), desc(kukai.updatedAt))
    .all();

  const scoreBySubmission = new Map<string, number>();
  if (subRows.length > 0) {
    const selRows = await db
      .select({ submissionId: selections.submissionId, kind: selections.kind })
      .from(selections)
      .where(
        inArray(
          selections.submissionId,
          subRows.map((s) => s.id),
        ),
      )
      .all();
    const pointsByKukai = new Map(
      subRows.map((s) => [
        s.kukaiId,
        { special: s.specialPoints, regular: s.regularPoints, reverse: s.reversePoints },
      ]),
    );
    const kukaiBySubmission = new Map(subRows.map((s) => [s.id, s.kukaiId]));
    for (const sr of selRows) {
      const kid = kukaiBySubmission.get(sr.submissionId);
      const pts = kid ? pointsByKukai.get(kid) : undefined;
      if (!pts) continue;
      scoreBySubmission.set(
        sr.submissionId,
        (scoreBySubmission.get(sr.submissionId) ?? 0) + pts[sr.kind],
      );
    }
  }

  return {
    haigo: user.haigo,
    publicId: user.publicId,
    items: subRows.map((s) => ({
      id: s.id,
      content: s.content,
      kukaiName: s.kukaiName,
      theme: s.theme,
      date: s.resultAt ?? s.kukaiUpdatedAt,
      score: scoreBySubmission.get(s.id) ?? 0,
    })),
  };
}
