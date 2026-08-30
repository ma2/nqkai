import { useRef, useState } from "react";
import { data, Form, Link, redirect, useNavigate, useSearchParams } from "react-router";
import { recoveryRequestSchema } from "~/lib/schemas";
import { redeemRecovery } from "~/lib/webauthn-client";
import { getAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { assertTrustedRequest, clientIp, firstZodError } from "~/server/http.server";
import { rateLimit } from "~/server/ratelimit.server";
import { createRecoveryRequest } from "~/server/recovery.server";
import type { Route } from "./+types/recover";

export const meta: Route.MetaFunction = () => [{ title: "パスキーの復旧 — nQkai" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await getAuth(db, request);
  if (auth) throw redirect("/");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { env, db } = getServerContext(context);

  const form = await request.formData();
  const parsed = recoveryRequestSchema.safeParse({
    email: form.get("email"),
    note: form.get("note") || undefined,
  });
  if (!parsed.success) {
    return data({ error: firstZodError(parsed.error) }, { status: 422 });
  }

  const ip = clientIp(request) ?? "unknown";
  const rl = await rateLimit(env.KV, `recover:${ip}:${parsed.data.email}`, {
    limit: 3,
    windowSeconds: 3600,
  });
  // レート超過でも同じ応答（列挙・総当たり対策）
  if (rl.ok) {
    await createRecoveryRequest(db, parsed.data.email, parsed.data.note);
  }
  return data({
    ok: "依頼を受け付けました。所属する結社の管理者が対応します。管理者から連絡がない場合は直接ご連絡ください。",
  });
}

export default function Recover({ actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const mode = params.get("mode") === "code" ? "code" : "request";

  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRedeem(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await redeemRecovery({
        email: emailRef.current?.value ?? "",
        code: codeRef.current?.value ?? "",
      });
      navigate("/settings", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "再登録に失敗しました");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-xl font-bold">パスキーの復旧</h1>

      <div className="flex gap-4 border-b border-stone-200 text-sm">
        <Link
          to="/recover"
          className={`pb-2 ${mode === "request" ? "border-b-2 border-stone-900 font-medium" : "text-stone-500"}`}
        >
          管理者に依頼する
        </Link>
        <Link
          to="/recover?mode=code"
          className={`pb-2 ${mode === "code" ? "border-b-2 border-stone-900 font-medium" : "text-stone-500"}`}
        >
          復旧コードで再登録
        </Link>
      </div>

      {mode === "request" ? (
        <div className="space-y-4">
          <p className="text-sm text-stone-600">
            すべてのパスキーを失った場合、所属する結社の管理者が「復旧コード」を発行できます。
            下記から依頼すると管理者に通知されます。管理者は本人確認のうえ、アプリ外（電話・LINE・対面など）で
            コードをお伝えします。
          </p>
          {actionData && "ok" in actionData && actionData.ok ? (
            <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{actionData.ok}</p>
          ) : (
            <Form method="post" className="space-y-3">
              <label className="block">
                <span className="text-sm text-stone-600">登録メールアドレス</span>
                <input
                  name="email"
                  type="email"
                  required
                  className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-sm text-stone-600">管理者へのメモ（任意）</span>
                <textarea
                  name="note"
                  rows={2}
                  maxLength={500}
                  className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
                />
              </label>
              {actionData && "error" in actionData && actionData.error ? (
                <p className="text-sm text-red-600">{actionData.error}</p>
              ) : null}
              <button
                type="submit"
                className="rounded bg-stone-900 px-4 py-2 text-white hover:bg-stone-700"
              >
                復旧を依頼する
              </button>
            </Form>
          )}
        </div>
      ) : (
        <form className="space-y-3" onSubmit={onRedeem}>
          <p className="text-sm text-stone-600">
            管理者から受け取ったコードを入力し、この端末に新しいパスキーを登録します。
          </p>
          <label className="block">
            <span className="text-sm text-stone-600">登録メールアドレス</span>
            <input
              ref={emailRef}
              type="email"
              autoComplete="username webauthn"
              required
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-stone-600">復旧コード</span>
            <input
              ref={codeRef}
              required
              placeholder="ABCD-EFGH-JKMN"
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2 font-mono tracking-widest"
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-50"
          >
            {pending ? "再登録中…" : "パスキーを再登録"}
          </button>
        </form>
      )}

      <p className="text-sm text-stone-500">
        <Link to="/login" className="underline">
          ログインに戻る
        </Link>
      </p>
    </div>
  );
}
