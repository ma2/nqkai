/**
 * 状態変更リクエストの簡易 CSRF 対策。
 * Origin がリクエスト URL のオリジンと一致するか、Sec-Fetch-Site が same-origin/none であることを要求する。
 */
export function assertTrustedRequest(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD") return;

  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin === url.origin) return;

  const site = request.headers.get("sec-fetch-site");
  if (!origin && (site === "same-origin" || site === "none")) return;

  throw new Response("クロスオリジンのリクエストは拒否されました", { status: 403 });
}

/** JSON レスポンスの薄いヘルパ（Set-Cookie などの追加ヘッダを許可） */
export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

/** zod のエラーから最初のメッセージを取り出す */
export function firstZodError(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "入力内容を確認してください";
}

/** Cloudflare が付与するクライアント IP（監査ログ用） */
export function clientIp(request: Request): string | null {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? null;
}
