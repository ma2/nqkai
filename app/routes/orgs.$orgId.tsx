import { data, Form, Link, redirect } from "react-router";
import { KUKAI_PHASE_LABEL, ORG_ROLE_LABEL } from "~/lib/constants";
import { joinRequestSchema } from "~/lib/schemas";
import { getAuth, requireAuth } from "~/server/auth.server";
import { canManageOrg, loadOrgContext } from "~/server/authz.server";
import { getServerContext } from "~/server/context.server";
import { assertTrustedRequest } from "~/server/http.server";
import { listKukaiForOrg } from "~/server/kukai.server";
import {
  createJoinRequest,
  getOrganizationOverview,
  leaveOrganization,
  OrgError,
  withdrawJoinRequest,
} from "~/server/orgs.server";
import type { Route } from "./+types/orgs.$orgId";

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: loaderData ? `${loaderData.org.name} — nQkai` : "結社 — nQkai" },
];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await getAuth(db, request);
  const ctx = await loadOrgContext(db, params.orgId, auth?.user.id ?? null);
  const overview = await getOrganizationOverview(db, params.orgId, auth?.user.id ?? null);
  const kukaiList = await listKukaiForOrg(db, params.orgId, false);

  return {
    org: {
      id: ctx.organization.id,
      name: ctx.organization.name,
      description: ctx.organization.description,
      status: ctx.organization.status,
      imageUrl: ctx.organization.imageKey
        ? `/api/orgs/${ctx.organization.id}/image?v=${ctx.organization.updatedAt.getTime()}`
        : null,
    },
    role: ctx.role,
    memberCount: overview.memberCount,
    pendingRequest: overview.pendingRequest,
    canManage: canManageOrg(ctx, auth?.user.isSystemAdmin ?? false),
    isAuthed: !!auth,
    kukaiList: kukaiList.map((x) => ({ id: x.id, name: x.name, phase: x.phase })),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  try {
    switch (intent) {
      case "joinRequest": {
        const parsed = joinRequestSchema.safeParse({ message: form.get("message") || undefined });
        await createJoinRequest(
          db,
          params.orgId,
          auth.user.id,
          parsed.success ? parsed.data.message : undefined,
        );
        return data({ ok: "参加申請を送信しました" });
      }
      case "withdrawRequest":
        await withdrawJoinRequest(db, params.orgId, auth.user.id);
        return data({ ok: "申請を取り下げました" });
      case "leave":
        await leaveOrganization(db, params.orgId, auth.user.id);
        return redirect("/orgs");
      default:
        return data({ error: "不明な操作です" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof OrgError) return data({ error: e.message }, { status: 409 });
    throw e;
  }
}

export default function OrgDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { org, role, memberCount, pendingRequest, canManage, isAuthed, kukaiList } = loaderData;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        {org.imageUrl ? (
          <img
            src={org.imageUrl}
            alt=""
            className="size-20 shrink-0 rounded object-cover"
            width={80}
            height={80}
          />
        ) : null}
        <div>
          <h1 className="text-2xl font-bold">
            {org.name}
            {org.status === "closed" ? (
              <span className="ml-2 rounded bg-stone-200 px-2 py-0.5 align-middle text-xs text-stone-600">
                閉鎖
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-stone-500">メンバー {memberCount} 名</p>
        </div>
      </div>

      {org.description ? (
        <p className="whitespace-pre-wrap text-stone-700">{org.description}</p>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">句会</h2>
          {role ? (
            <Link to={`/orgs/${org.id}/kukai/new`} className="text-sm text-stone-600 underline">
              句会を作成
            </Link>
          ) : null}
        </div>
        {kukaiList.length === 0 ? (
          <p className="text-sm text-stone-500">まだ句会がありません。</p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
            {kukaiList.map((kk) => (
              <li key={kk.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <Link to={`/kukai/${kk.id}`} className="font-medium hover:underline">
                  {kk.name}
                </Link>
                <span className="text-stone-500">
                  {KUKAI_PHASE_LABEL[kk.phase as keyof typeof KUKAI_PHASE_LABEL] ?? kk.phase}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {actionData && "ok" in actionData && actionData.ok ? (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{actionData.ok}</p>
      ) : null}
      {actionData && "error" in actionData && actionData.error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{actionData.error}</p>
      ) : null}

      <div className="rounded border border-stone-200 bg-white p-4">
        {role ? (
          <div className="space-y-3">
            <p className="text-sm">
              あなたの役割：<span className="font-medium">{ORG_ROLE_LABEL[role]}</span>
            </p>
            <div className="flex gap-3">
              {canManage ? (
                <Link
                  to={`/orgs/${org.id}/admin`}
                  className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white hover:bg-stone-700"
                >
                  結社管理
                </Link>
              ) : null}
              <Form method="post">
                <input type="hidden" name="intent" value="leave" />
                <button
                  type="submit"
                  className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                >
                  退会
                </button>
              </Form>
            </div>
          </div>
        ) : !isAuthed ? (
          <p className="text-sm text-stone-500">
            参加するには{" "}
            <Link to="/login" className="underline">
              ログイン
            </Link>
            してください。
          </p>
        ) : pendingRequest ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-stone-600">参加申請中（管理者の承認待ち）</span>
            <Form method="post">
              <input type="hidden" name="intent" value="withdrawRequest" />
              <button type="submit" className="text-sm text-stone-500 underline">
                取り下げ
              </button>
            </Form>
          </div>
        ) : org.status === "closed" ? (
          <p className="text-sm text-stone-500">この結社は閉鎖されています。</p>
        ) : (
          <Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="joinRequest" />
            <label className="block">
              <span className="text-sm text-stone-600">申請メッセージ（任意）</span>
              <textarea
                name="message"
                rows={3}
                maxLength={500}
                className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
              />
            </label>
            <button
              type="submit"
              className="rounded bg-stone-900 px-4 py-2 text-white hover:bg-stone-700"
            >
              参加を申請
            </button>
          </Form>
        )}
      </div>
    </div>
  );
}
