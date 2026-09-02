import { describe, expect, it } from "vitest";
import {
  type RankableSelection,
  type RankableSubmission,
  rankResults,
} from "~/server/results.server";

const POINTS = { special: 3, regular: 1, reverse: -1 };

// createdAt 昇順で渡す前提
const subs: RankableSubmission[] = [
  { id: "a", content: "句A", authorHaigo: "甲" },
  { id: "b", content: "句B", authorHaigo: "乙" },
  { id: "c", content: "句C", authorHaigo: "丙" },
];

const sel = (
  submissionId: string,
  kind: RankableSelection["kind"],
  selectorHaigo = "選",
): RankableSelection => ({
  submissionId,
  kind,
  selectorHaigo,
});

describe("rankResults", () => {
  it("スコアは種別点数の合計、逆選は減点", () => {
    const rows = rankResults(
      subs,
      [sel("a", "special"), sel("a", "regular"), sel("b", "reverse")],
      POINTS,
      true,
    );
    const byId = (id: string) => rows.find((r) => r.submissionId === id)!;
    expect(byId("a").score).toBe(4); // 3 + 1
    expect(byId("b").score).toBe(-1); // 逆選
    expect(byId("c").score).toBe(0);
    expect(byId("a").counts).toEqual({ special: 1, regular: 1, reverse: 0 });
  });

  it("スコア降順に並び、同点は投句順（配列順）で安定", () => {
    const rows = rankResults(subs, [sel("b", "special"), sel("c", "regular")], POINTS, true);
    expect(rows.map((r) => r.submissionId)).toEqual(["b", "c", "a"]);
  });

  it("同点は同順位、その次は人数分飛ぶ（1,1,3）", () => {
    const rows = rankResults(
      subs,
      [sel("a", "regular"), sel("b", "regular"), sel("c", "special")],
      POINTS,
      true,
    );
    // c=3点, a=1点, b=1点
    expect(rows.map((r) => [r.submissionId, r.score, r.rank])).toEqual([
      ["c", 3, 1],
      ["a", 1, 2],
      ["b", 1, 2],
    ]);
  });

  it("選句ゼロでも全投句が rank 1 で返る", () => {
    const rows = rankResults(subs, [], POINTS, true);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.rank === 1 && r.score === 0)).toBe(true);
  });

  it("revealed=false の間は作者を落とす、true で復活", () => {
    expect(rankResults(subs, [], POINTS, false).every((r) => r.authorHaigo === null)).toBe(true);
    expect(rankResults(subs, [], POINTS, true).map((r) => r.authorHaigo)).toEqual([
      "甲",
      "乙",
      "丙",
    ]);
  });

  it("存在しない投句への選句は無視する", () => {
    const rows = rankResults(subs, [sel("zzz", "special"), sel("a", "regular")], POINTS, true);
    expect(rows.find((r) => r.submissionId === "a")?.score).toBe(1);
    expect(rows).toHaveLength(3);
  });

  it("選者内訳（selectors）を種別付きで積む", () => {
    const rows = rankResults(
      subs,
      [sel("a", "special", "甲選"), sel("a", "reverse", "乙選")],
      POINTS,
      true,
    );
    const a = rows.find((r) => r.submissionId === "a")!;
    expect(a.selectors).toEqual([
      { haigo: "甲選", kind: "special" },
      { haigo: "乙選", kind: "reverse" },
    ]);
  });
});
