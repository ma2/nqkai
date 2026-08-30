/**
 * KV ベースの素朴な固定ウィンドウ・レートリミッタ。
 * 厳密なカウントは保証しないが、総当たり・スパムの抑制には十分。
 */
export async function rateLimit(
  kv: KVNamespace,
  key: string,
  opts: { limit: number; windowSeconds: number },
): Promise<{ ok: boolean; remaining: number }> {
  const k = `rl:${key}`;
  const raw = await kv.get(k);
  const count = raw ? Number.parseInt(raw, 10) || 0 : 0;
  if (count >= opts.limit) {
    return { ok: false, remaining: 0 };
  }
  await kv.put(k, String(count + 1), { expirationTtl: opts.windowSeconds });
  return { ok: true, remaining: opts.limit - count - 1 };
}
