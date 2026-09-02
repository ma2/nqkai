import { describe, expect, it } from "vitest";
import {
  csvCell,
  formatKukaiCsv,
  formatKukaiText,
  formatPersonalHaikuText,
  type KukaiExportData,
  toCsv,
  UTF8_BOM,
  ymd,
} from "~/lib/export";

describe("ymd", () => {
  it("UTC 基準の YYYY-MM-DD", () => {
    expect(ymd(new Date("2026-01-05T23:30:00Z"))).toBe("2026-01-05");
  });
});

describe("csvCell / toCsv", () => {
  it("カンマ・引用符・改行を含むセルはクォートしエスケープ", () => {
    expect(csvCell("abc")).toBe("abc");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(3)).toBe("3");
  });
  it("BOM 付き・CRLF 改行・末尾 CRLF", () => {
    const csv = toCsv([
      ["a", "b"],
      [1, 2],
    ]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toBe(`${UTF8_BOM}a,b\r\n1,2\r\n`);
  });
});

describe("formatPersonalHaikuText", () => {
  it("句と（日付 / 句会 / 兼題 / 得点）を並べる", () => {
    const txt = formatPersonalHaikuText("芭蕉", [
      {
        id: "s1",
        content: "古池や蛙飛び込む水の音",
        kukaiName: "三月例会",
        theme: "春",
        date: new Date("2026-03-10T12:00:00Z"),
        score: 7,
      },
      {
        id: "s2",
        content: "夏草や兵どもが夢の跡",
        kukaiName: "七月例会",
        theme: "",
        date: new Date("2026-07-01T00:00:00Z"),
        score: 0,
      },
    ]);
    const expected = [
      "芭蕉 の句",
      "全 2 句",
      "",
      "古池や蛙飛び込む水の音",
      "  （2026-03-10 / 三月例会 / 兼題：春 / 7点）",
      "",
      "夏草や兵どもが夢の跡",
      "  （2026-07-01 / 七月例会 / 0点）",
      "",
    ].join("\n");
    expect(txt).toBe(expected);
  });

  it("句が無くてもヘッダだけ返る", () => {
    expect(formatPersonalHaikuText("無季", [])).toBe("無季 の句\n全 0 句\n");
  });
});

const kukaiData: KukaiExportData = {
  kukaiName: "一月例会",
  theme: "冬",
  exportedAt: new Date("2026-01-20T09:00:00Z"),
  authorsRevealed: true,
  rows: [
    {
      rank: 1,
      score: 3,
      content: "冬の月",
      authorHaigo: "甲",
      special: 1,
      regular: 0,
      reverse: 0,
      selectors: ["乙（特選）"],
      comments: [{ haigo: "乙", body: "静かで良い" }],
    },
    {
      rank: 2,
      score: 0,
      content: "木枯らし, 強し",
      authorHaigo: null,
      special: 0,
      regular: 0,
      reverse: 0,
      selectors: [],
      comments: [],
    },
  ],
};

describe("formatKukaiText", () => {
  it("順位・点・選内訳・作者・選者・講評を出す", () => {
    const txt = formatKukaiText(kukaiData);
    expect(txt).toContain("【句会】一月例会");
    expect(txt).toContain("【兼題】冬");
    expect(txt).toContain("1位（3点）冬の月");
    expect(txt).toContain("  選：特選1");
    expect(txt).toContain("  作者：甲");
    expect(txt).toContain("  選者：乙（特選）");
    expect(txt).toContain("  講評（乙）：静かで良い");
    expect(txt).toContain("2位（0点）木枯らし, 強し");
  });
  it("兼題が空なら【兼題】行を出さない", () => {
    expect(formatKukaiText({ ...kukaiData, theme: "" })).not.toContain("【兼題】");
  });
});

describe("formatKukaiCsv", () => {
  it("BOM・メタ行・ヘッダ・明細、カンマ入りの句はクォート", () => {
    const csv = formatKukaiCsv(kukaiData);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toContain("# 句会,一月例会");
    expect(csv).toContain("順位,得点,句,作者,特選,並選,逆選,選者,講評");
    expect(csv).toContain("1,3,冬の月,甲,1,0,0,乙（特選）,乙：静かで良い");
    expect(csv).toContain('2,0,"木枯らし, 強し",,0,0,0,,');
  });
});
