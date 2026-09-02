/** オープンリダイレクト対策：自サイト内の絶対パスだけ許可する */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  // 先頭が「/」でない、または「//」「/\」で始まる（プロトコル相対・別ホスト誘導）は拒否。
  // ブラウザは「/\evil.com」を「//evil.com」と同様に解釈するため両方を弾く。
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
