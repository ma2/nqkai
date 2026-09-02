/** エクスポートの整形（純関数）。CSV は UTF-8 + BOM でダウンロードさせる。 */

export const UTF8_BOM = "﻿";

/** YYYY-MM-DD（ローカルではなく UTC 基準で安定させる） */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface PersonalHaikuItem {
  /** 投句 ID（一覧の key 用。テキスト書き出しでは使わない） */
  id: string;
  content: string;
  kukaiName: string;
  theme: string;
  date: Date;
  score: number;
}

/** 個人俳句一覧のテキスト書き出し。 */
export function formatPersonalHaikuText(haigo: string, items: PersonalHaikuItem[]): string {
  const lines: string[] = [`${haigo} の句`, `全 ${items.length} 句`, ""];
  for (const it of items) {
    lines.push(it.content);
    const meta = [`${ymd(it.date)}`, it.kukaiName];
    if (it.theme) meta.push(`兼題：${it.theme}`);
    meta.push(`${it.score}点`);
    lines.push(`  （${meta.join(" / ")}）`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/** 1 セルを CSV エスケープする。 */
export function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 行の配列を CSV 文字列（CRLF 改行、BOM 付き）にする。 */
export function toCsv(rows: (string | number)[][]): string {
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  return `${UTF8_BOM}${body}\r\n`;
}

export interface KukaiExportData {
  kukaiName: string;
  theme: string;
  exportedAt: Date;
  authorsRevealed: boolean;
  rows: {
    rank: number;
    score: number;
    content: string;
    authorHaigo: string | null;
    special: number;
    regular: number;
    reverse: number;
    selectors: string[];
    comments: { haigo: string; body: string }[];
  }[];
}

/** 句会エクスポート：人が読むテキスト形式。 */
export function formatKukaiText(d: KukaiExportData): string {
  const out: string[] = [
    `【句会】${d.kukaiName}`,
    d.theme ? `【兼題】${d.theme}` : "",
    `【書き出し】${d.exportedAt.toISOString()}`,
    d.authorsRevealed ? "【作者】公開済み" : "【作者】未公開",
    "",
  ].filter((l) => l !== "");

  for (const r of d.rows) {
    out.push(`${r.rank}位（${r.score}点）${r.content}`);
    const kinds: string[] = [];
    if (r.special) kinds.push(`特選${r.special}`);
    if (r.regular) kinds.push(`並選${r.regular}`);
    if (r.reverse) kinds.push(`逆選${r.reverse}`);
    if (kinds.length) out.push(`  選：${kinds.join(" ")}`);
    if (r.authorHaigo) out.push(`  作者：${r.authorHaigo}`);
    if (r.selectors.length) out.push(`  選者：${r.selectors.join("、")}`);
    for (const c of r.comments) out.push(`  講評（${c.haigo}）：${c.body}`);
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/** 句会エクスポート：CSV（メタ行 + ヘッダ + 明細）。 */
export function formatKukaiCsv(d: KukaiExportData): string {
  const rows: (string | number)[][] = [
    ["# 句会", d.kukaiName],
    ["# 兼題", d.theme],
    ["# 書き出し", d.exportedAt.toISOString()],
    ["# 作者", d.authorsRevealed ? "公開済み" : "未公開"],
    [],
    ["順位", "得点", "句", "作者", "特選", "並選", "逆選", "選者", "講評"],
  ];
  for (const r of d.rows) {
    rows.push([
      r.rank,
      r.score,
      r.content,
      r.authorHaigo ?? "",
      r.special,
      r.regular,
      r.reverse,
      r.selectors.join("、"),
      r.comments.map((c) => `${c.haigo}：${c.body}`).join(" / "),
    ]);
  }
  return toCsv(rows);
}
