import { eq } from "drizzle-orm";
import type { SelectionKind } from "~/lib/constants";
import type { Db } from "./db/client.server";
import { guestParticipants, type Kukai, selections, users } from "./db/schema";
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

/** 集計対象の投句（createdAt 昇順で渡すこと）。 */
export interface RankableSubmission {
  id: string;
  content: string;
  authorHaigo: string | null;
}

/** 1件の選句。 */
export interface RankableSelection {
  submissionId: string;
  kind: SelectionKind;
  selectorHaigo: string | null;
}

/**
 * 投句と選句からスコア・順位・内訳を組み立てる純関数。
 * - スコアは種別ごとの点数（逆選は負値になり得る）の合計。
 * - 並びはスコア降順、同点は投句時刻昇順（`subs` の順）で安定。
 * - 表示順位は同点同順位（1,1,3,…）。
 * - `revealed` が false の間は作者を落とす。
 */
export function rankResults(
  subs: RankableSubmission[],
  sels: RankableSelection[],
  points: Record<SelectionKind, number>,
  revealed: boolean,
): ResultRow[] {
  const order = new Map(subs.map((s, i) => [s.id, i]));
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
  for (const sr of sels) {
    const row = bySubmission.get(sr.submissionId);
    if (!row) continue;
    row.counts[sr.kind]++;
    row.score += points[sr.kind];
    row.selectors.push({ haigo: sr.selectorHaigo, kind: sr.kind });
  }

  const rows = [...bySubmission.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (order.get(a.submissionId) ?? 0) - (order.get(b.submissionId) ?? 0);
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

/** result フェーズ以降の集計。順位はスコア降順、同点は投句時刻昇順で安定。表示順位は同点同順位。 */
export async function computeResults(db: Db, k: Kukai): Promise<ResultRow[]> {
  const subs = await listVisibleSubmissions(db, k.id);

  const selRows = await db
    .select({
      submissionId: selections.submissionId,
      kind: selections.kind,
      selectorHaigo: users.haigo,
      selectorGuestName: guestParticipants.displayName,
    })
    .from(selections)
    .leftJoin(users, eq(users.id, selections.selectorUserId))
    .leftJoin(guestParticipants, eq(guestParticipants.id, selections.selectorGuestId))
    .where(eq(selections.kukaiId, k.id))
    .all();

  return rankResults(
    subs.map((s) => ({ id: s.id, content: s.content, authorHaigo: s.authorHaigo })),
    selRows.map((r) => ({ ...r, selectorHaigo: r.selectorHaigo ?? r.selectorGuestName })),
    {
      special: k.specialPoints,
      regular: k.regularPoints,
      reverse: k.reversePoints,
    },
    k.authorsRevealedAt != null,
  );
}
