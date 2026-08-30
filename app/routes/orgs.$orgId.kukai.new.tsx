import { data, Form, redirect } from "react-router";
import { kukaiSettingsSchema } from "~/lib/schemas";
import { requireAuth } from "~/server/auth.server";
import { loadOrgContext } from "~/server/authz.server";
import { getServerContext } from "~/server/context.server";
import { assertTrustedRequest, firstZodError } from "~/server/http.server";
import { createKukai } from "~/server/kukai.server";
import type { Route } from "./+types/orgs.$orgId.kukai.new";

export const meta: Route.MetaFunction = () => [{ title: "句会を作成 — nQkai" }];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const ctx = await loadOrgContext(db, params.orgId, auth.user.id);
  if (!ctx.role) throw new Response("結社のメンバーのみ句会を作成できます", { status: 403 });
  if (ctx.organization.status === "closed") {
    throw new Response("閉鎖された結社では句会を作成できません", { status: 409 });
  }
  return { orgName: ctx.organization.name };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const ctx = await loadOrgContext(db, params.orgId, auth.user.id);
  if (!ctx.role) throw new Response(null, { status: 403 });

  const form = await request.formData();
  const parsed = kukaiSettingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return data({ error: firstZodError(parsed.error) }, { status: 422 });
  }
  const id = await createKukai(db, params.orgId, auth.user.id, parsed.data);
  return redirect(`/kukai/${id}`);
}

function Num({ name, label, def }: { name: string; label: string; def: number }) {
  return (
    <label className="block">
      <span className="text-sm text-stone-600">{label}</span>
      <input
        type="number"
        name={name}
        defaultValue={def}
        className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
      />
    </label>
  );
}

function When({ name, label }: { name: string; label: string }) {
  return (
    <label className="block">
      <span className="text-sm text-stone-600">{label}</span>
      <input
        type="datetime-local"
        name={name}
        className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
      />
    </label>
  );
}

export default function KukaiNew({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">句会を作成 — {loaderData.orgName}</h1>

      <Form method="post" className="space-y-6">
        <section className="space-y-3">
          <label className="block">
            <span className="text-sm text-stone-600">句会名</span>
            <input
              name="name"
              required
              maxLength={80}
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-stone-600">兼題（お題）</span>
            <input
              name="theme"
              maxLength={100}
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-stone-600">説明</span>
            <textarea
              name="description"
              rows={3}
              maxLength={2000}
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-stone-600">公開設定</span>
            <select
              name="visibility"
              defaultValue="private"
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            >
              <option value="private">プライベート（結社メンバーのみ）</option>
              <option value="public">パブリック（終了後は誰でも閲覧可）</option>
            </select>
          </label>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Num name="submissionsPerUser" label="一人あたり投句数" def={1} />
          <Num name="specialCount" label="特選の数" def={1} />
          <Num name="regularCount" label="並選の数" def={5} />
          <Num name="reverseCount" label="逆選の数" def={0} />
          <Num name="specialPoints" label="特選の点" def={3} />
          <Num name="regularPoints" label="並選の点" def={1} />
          <Num name="reversePoints" label="逆選の点" def={-1} />
        </section>

        <details className="rounded border border-stone-200 p-3">
          <summary className="cursor-pointer text-sm text-stone-600">
            予定時刻（任意・目安。自動遷移はしません）
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <When name="scheduledSubmissionStartAt" label="投句開始" />
            <When name="scheduledSubmissionEndAt" label="投句締切" />
            <When name="scheduledSelectionStartAt" label="選句開始" />
            <When name="scheduledSelectionEndAt" label="選句締切" />
            <When name="scheduledResultAt" label="結果発表" />
            <When name="scheduledCommentStartAt" label="講評開始" />
            <When name="scheduledCommentEndAt" label="講評締切" />
          </div>
        </details>

        {actionData?.error ? <p className="text-sm text-red-600">{actionData.error}</p> : null}
        <button
          type="submit"
          className="rounded bg-stone-900 px-4 py-2 text-white hover:bg-stone-700"
        >
          作成（準備中フェーズ）
        </button>
      </Form>
    </div>
  );
}
