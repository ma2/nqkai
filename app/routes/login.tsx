import { useRef, useState } from "react";
import { Link, redirect, useNavigate, useSearchParams } from "react-router";
import { Logo } from "~/components/Logo";
import { safeNext } from "~/lib/nav";
import { loginPasskey } from "~/lib/webauthn-client";
import { getAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import type { Route } from "./+types/login";

export const meta: Route.MetaFunction = () => [{ title: "ログイン — nQkai" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await getAuth(db, request);
  if (auth) {
    throw redirect(safeNext(new URL(request.url).searchParams.get("next")));
  }
  return null;
}

export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const emailRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = safeNext(params.get("next"));

  async function run(withEmail: boolean) {
    const email = emailRef.current?.value ?? "";
    if (withEmail && !email) {
      setError("メールアドレスを入力してください");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await loginPasskey(withEmail ? { email } : {});
      navigate(next, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログインに失敗しました");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <Link to="/" className="mx-auto block w-fit py-2">
        <Logo size={36} />
      </Link>
      <h1 className="font-mincho text-xl font-medium tracking-wide">ログイン</h1>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(true);
        }}
      >
        <label className="block">
          <span className="text-sm text-sumi-soft">メールアドレス</span>
          <input
            ref={emailRef}
            name="email"
            type="email"
            autoComplete="username webauthn"
            required
            className="mt-1 w-full rounded border border-rule px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-ai px-4 py-2 text-washi hover:bg-ai-deep disabled:opacity-50"
        >
          {pending ? "認証中…" : "パスキーでログイン"}
        </button>
      </form>

      <button
        type="button"
        disabled={pending}
        onClick={() => void run(false)}
        className="w-full rounded border border-rule px-4 py-2 text-sumi hover:bg-washi-edge disabled:opacity-50"
      >
        端末のパスキーを選んでログイン
      </button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <p className="text-sm text-sumi-soft">
        アカウントをお持ちでない場合は{" "}
        <Link to="/register" className="underline">
          新規登録
        </Link>
      </p>
      <p className="text-sm text-sumi-soft">
        パスキーを使えない場合は{" "}
        <Link to="/recover" className="underline">
          パスキーの復旧
        </Link>
      </p>
      <noscript>
        <p className="text-sm text-red-600">パスキー認証には JavaScript が必要です。</p>
      </noscript>
    </div>
  );
}
