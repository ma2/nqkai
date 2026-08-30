import { eq } from "drizzle-orm";
import type { SelectionKind } from "~/lib/constants";
import type { Db } from "./db/client.server";
import { type Kukai, selections, users } from "./db/schema";
import { listVisibleSubmissions } from "./submissions.server";

export interface ResultRow {
  submissionId: string;
  content: string;
  /** authorsRevealedAt 設定後のみ非 null */
  authorHaigo: string | null;
  counts: Record<SelectionKind, number>;
  score: number;
  rank: number;
  selectors: { haigo: string | null; kind: SelectionKind }[];
}

/** result フェーズ以降の集計。順位はスコア降順、同点は投句時刻昇順で安定。表示順位は同点同順位。 */
export async function computeResults(db: Db, k: Kukai): Promise<ResultRow[]> {
  const subs = await listVisibleSubmissions(db, k.id);

  const selRows = await db
    .select({
      submissionId: selections.submissionId,
      kind: selections.kind,
      selectorHaigo: users.haigo,
    })
    .from(selections)
    .leftJoin(users, eq(users.id, selections.selectorUserId))
    .where(eq(selections.kukaiId, k.id))
    .all();

  const revealed = k.authorsRevealedAt != null;
  const points: Record<SelectionKind, number> = {
    special: k.specialPoints,
    regular: k.regularPoints,
    reverse: k.reversePoints,
  };

  const bySubmission = new Map<string, ResultRow>();
  for (const s of subs) {
    bySubmission.set(s.id, {
      submissionId: s.id,
      content: s.content,
      authorHaigo: revealed ? s.authorHaigo : null,
      counts: { special: 0, regular: 0, reverse: 0 },
      score: 0,
      rank: 0,
      selectors: [],
    });
  }
  for (const sr of selRows) {
    const row = bySubmission.get(sr.submissionId);
    if (!row) continue;
    row.counts[sr.kind]++;
    row.score += points[sr.kind];
    row.selectors.push({ haigo: sr.selectorHaigo, kind: sr.kind });
  }

  const rows = [...bySubmission.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ai = subs.findIndex((s) => s.id === a.submissionId);
    const bi = subs.findIndex((s) => s.id === b.submissionId);
    return ai - bi; // subs は createdAt 昇順
  });

  let rank = 0;
  let prevScore: number | null = null;
  rows.forEach((r, i) => {
    if (prevScore === null || r.score !== prevScore) {
      rank = i + 1;
      prevScore = r.score;
    }
    r.rank = rank;
  });

  return rows;
}
