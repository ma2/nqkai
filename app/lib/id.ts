/** UUID v4（主キー・public_id 用） */
export function newId(): string {
  return crypto.randomUUID();
}

/** URL セーフなランダムトークン（セッショントークン等） */
export function newToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

/** 文字列の SHA-256 を hex で返す（セッショントークンのハッシュ化に使用） */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 紛らわしい文字（0/O/1/I/L）を除いた大文字英数字 */
const HUMAN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * 人が読める復旧コード。既定は 12 文字を 4 文字ずつ `ABCD-EFGH-JKMN` に整形。
 * 保存側は `-` を除いた正規形（大文字）をハッシュする。
 */
export function humanCode(groups = 3, groupLen = 4): string {
  const n = groups * groupLen;
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  let raw = "";
  for (let i = 0; i < n; i++) {
    raw += HUMAN_ALPHABET[buf[i]! % HUMAN_ALPHABET.length];
  }
  return raw.match(new RegExp(`.{1,${groupLen}}`, "g"))!.join("-");
}

/** 復旧コードの正規形（ハッシュ対象）：ハイフン・空白除去 + 大文字化 */
export function normalizeCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}
