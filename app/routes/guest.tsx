import { data, Form, redirect } from "react-router";
import { PageTitle } from "~/components/ui";
import { guestJoinSchema } from "~/lib/schemas";
import { getOrCreateGuestSession } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { checkGuestCode, guestCodeErrorMessage, joinKukaiAsGuest } from "~/server/guest.server";
import { assertTrustedRequest, clientIp, firstZodError } from "~/server/http.server";
import { rateLimit } from "~/server/ratelimit.server";
import type { Route } from "./+types/guest";

export const meta: Route.MetaFunction = () => [{ title: "ゲスト参加 — nQkai" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!code) return { code: "", summary: null };

  const check = await checkGuestCode(db, code);
  if (!check.ok || !check.kukai) {
    return { code, summary: { ok: false as const, message: guestCodeErrorMessage(check.reason) } };
  }
  return {
    code,
    summary: {
      ok: true as const,
      kukaiName: check.kukai.name,
      theme: check.kukai.theme,
      orgName: check.orgName ?? "",
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { db, env } = getServerContext(context);
  const form = await request.formData();
  const parsed = guestJoinSchema.safeParse({ code: form.get("code") });
  if (!parsed.success) return data({ error: firstZodError(parsed.error) }, { status: 422 });

  const ip = clientIp(request) ?? "unknown";
  const rl = await rateLimit(env.KV, `guest-join:${ip}`, { limit: 20, windowSeconds: 3600 });
  if (!rl.ok) {
    return data({ error: "しばらく時間を置いてから再度お試しください" }, { status: 429 });
  }

  const check = await checkGuestCode(db, parsed.data.code);
  if (!check.ok || !check.code || !check.kukai) {
    return data({ error: guestCodeErrorMessage(check.reason) }, { status: 400 });
  }

  const { sessionId, setCookie } = await getOrCreateGuestSession(db, request, check.code.expiresAt);
  await joinKukaiAsGuest(db, check.code, check.kukai, sessionId);

  return redirect(`/kukai/${check.kukai.id}`, { headers: { "set-cookie": setCookie } });
}

export default function Guest({ loaderData, actionData }: Route.ComponentProps) {
  const { code, summary } = loaderData;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageTitle>ゲスト参加</PageTitle>

      {actionData?.error ? <p className="text-sm text-red-600">{actionData.error}</p> : null}

      {!code ? (
        <Form method="get" className="flex items-end gap-2">
          <label className="flex-1">
            <span className="text-sm text-sumi-soft">参加コード</span>
            <input
              name="code"
              required
              className="mt-1 w-full rounded border border-rule px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded bg-ai px-4 py-2 text-washi hover:bg-ai-deep">
            確認
          </button>
        </Form>
      ) : summary?.ok ? (
        <div className="space-y-4">
          <p className="text-sumi">
            <span className="font-medium">{summary.orgName}</span>「{summary.kukaiName}」
            {summary.theme ? (
              <span className="text-sumi-soft">（兼題：{summary.theme}）</span>
            ) : null}
            に参加します。
          </p>
          <Form method="post">
            <input type="hidden" name="code" value={code} />
            <button type="submit" className="rounded bg-ai px-4 py-2 text-washi hover:bg-ai-deep">
              参加する
            </button>
          </Form>
        </div>
      ) : (
        <p className="text-sm text-red-600">{summary?.message ?? "コードが見つかりません"}</p>
      )}
    </div>
  );
}
