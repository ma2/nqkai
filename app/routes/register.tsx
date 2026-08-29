import { useState } from "react";
import { Link, redirect, useNavigate } from "react-router";
import { registerPasskey } from "~/lib/webauthn-client";
import { getAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import type { Route } from "./+types/register";

export const meta: Route.MetaFunction = () => [{ title: "新規登録 — nQkai" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await getAuth(db, request);
  if (auth) throw redirect("/");
  return null;
}

export default function Register() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const haigo = String(fd.get("haigo") ?? "");
    setPending(true);
    setError(null);
    try {
      await registerPasskey({ email, haigo });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-xl font-bold">新規登録</h1>

      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-sm text-stone-600">メールアドレス</span>
          <input
            name="email"
            type="email"
            autoComplete="username webauthn"
            required
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm text-stone-600">俳号（表示名）</span>
          <input
            name="haigo"
            type="text"
            required
            maxLength={30}
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-stone-900 px-4 py-2 text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {pending ? "登録中…" : "パスキーを作成して登録"}
        </button>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <p className="text-sm text-stone-500">
        すでにアカウントをお持ちの場合は{" "}
        <Link to="/login" className="underline">
          ログイン
        </Link>
      </p>
      <noscript>
        <p className="text-sm text-red-600">パスキー認証には JavaScript が必要です。</p>
      </noscript>
    </div>
  );
}
