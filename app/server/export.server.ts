import { SELECTION_KIND_LABEL } from "~/lib/constants";
import type { KukaiExportData } from "~/lib/export";
import { listComments } from "./comments.server";
import type { Db } from "./db/client.server";
import type { Kukai } from "./db/schema";
import { computeResults } from "./results.server";

/** 句会エクスポート用のデータを集める（`result` 以降で呼ぶ前提）。 */
export async function buildKukaiExport(
  db: Db,
  k: Kukai,
  viewerUserId: string,
): Promise<KukaiExportData> {
  const [results, comments] = await Promise.all([
    computeResults(db, k),
    listComments(db, k, viewerUserId),
  ]);

  return {
    kukaiName: k.name,
    theme: k.theme,
    exportedAt: new Date(),
    authorsRevealed: k.authorsRevealedAt != null,
    rows: results.map((r) => ({
      rank: r.rank,
      score: r.score,
      content: r.content,
      authorHaigo: r.authorHaigo,
      special: r.counts.special,
      regular: r.counts.regular,
      reverse: r.counts.reverse,
      selectors: r.selectors.map((s) => `${s.haigo ?? "?"}（${SELECTION_KIND_LABEL[s.kind]}）`),
      comments: (comments[r.submissionId] ?? []).map((c) => ({
        haigo: c.haigo ?? "?",
        body: c.body,
      })),
    })),
  };
}
