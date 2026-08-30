import { data, Form } from "react-router";
import { ORG_ROLE_LABEL } from "~/lib/constants";
import { newId } from "~/lib/id";
import { orgUpdateSchema } from "~/lib/schemas";
import { requireAuth } from "~/server/auth.server";
import {
  assertCanManageOrg,
  assertOrgAdmin,
  isOrgAdmin,
  loadOrgContext,
} from "~/server/authz.server";
import { getServerContext } from "~/server/context.server";
import { assertTrustedRequest, clientIp, firstZodError } from "~/server/http.server";
import { replaceImage, validateImageUpload } from "~/server/images.server";
import {
  approveJoinRequest,
  listMembers,
  listPendingJoinRequests,
  OrgError,
  rejectJoinRequest,
  removeMember,
  setMemberRole,
  setOrganizationImageKey,
  setOrganizationStatus,
  updateOrganization,
} from "~/server/orgs.server";
import { issueRecoveryCode, listRecoveryRequests, RecoveryError } from "~/server/recovery.server";
import type { Route } from "./+types/orgs.$orgId.admin";

export const meta: Route.MetaFunction = () => [{ title: "結社管理 — nQkai" }];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const ctx = await loadOrgContext(db, params.orgId, auth.user.id);
  assertCanManageOrg(ctx, auth.user.isSystemAdmin);

  const [joinRequests, members, recoveryReqs] = await Promise.all([
    listPendingJoinRequests(db, params.orgId),
    listMembers(db, params.orgId),
    listRecoveryRequests(db, params.orgId),
  ]);

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
    canAdmin: isOrgAdmin(ctx, auth.user.isSystemAdmin),
    myUserId: auth.user.id,
    joinRequests,
    members,
    recoveryReqs,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { env, db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const ctx = await loadOrgContext(db, params.orgId, auth.user.id);
  assertCanManageOrg(ctx, auth.user.isSystemAdmin);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const orgId = params.orgId;

  try {
    switch (intent) {
      case "updateOrg": {
        const parsed = orgUpdateSchema.safeParse({
          name: form.get("name"),
          description: form.get("description") ?? "",
        });
        if (!parsed.success) return data({ error: firstZodError(parsed.error) }, { status: 422 });
        await updateOrganization(db, orgId, parsed.data);
        return data({ ok: "結社情報を更新しました" });
      }
      case "orgImage": {
        const v = validateImageUpload(form.get("image"));
        if ("error" in v) return data({ error: v.error }, { status: 422 });
        const key = `orgs/${orgId}/${newId()}`;
        await replaceImage(env.BUCKET, key, v.file, ctx.organization.imageKey);
        await setOrganizationImageKey(db, orgId, key);
        return data({ ok: "結社の画像を更新しました" });
      }
      case "deleteOrgImage": {
        if (ctx.organization.imageKey) await env.BUCKET.delete(ctx.organization.imageKey);
        await setOrganizationImageKey(db, orgId, null);
        return data({ ok: "結社の画像を削除しました" });
      }
      case "approveJoin":
        await approveJoinRequest(db, String(form.get("requestId")), orgId, auth.user.id);
        return data({ ok: "参加を承認しました" });
      case "rejectJoin":
        await rejectJoinRequest(db, String(form.get("requestId")), orgId, auth.user.id);
        return data({ ok: "申請を却下しました" });
      case "removeMember":
        await removeMember(db, orgId, String(form.get("targetUserId")), auth.user.id);
        return data({ ok: "メンバーを退会させました" });
      case "setRole": {
        assertOrgAdmin(ctx, auth.user.isSystemAdmin);
        const role = String(form.get("role"));
        if (role !== "admin" && role !== "deputy_admin" && role !== "member") {
          return data({ error: "役割が不正です" }, { status: 422 });
        }
        await setMemberRole(db, orgId, String(form.get("targetUserId")), role);
        return data({ ok: "役割を変更しました" });
      }
      case "close":
        assertOrgAdmin(ctx, auth.user.isSystemAdmin);
        await setOrganizationStatus(db, orgId, "closed");
        return data({ ok: "結社を閉鎖しました" });
      case "reopen":
        assertOrgAdmin(ctx, auth.user.isSystemAdmin);
        await setOrganizationStatus(db, orgId, "open");
        return data({ ok: "結社を再開しました" });
      case "issueRecovery": {
        const targetUserId = String(form.get("targetUserId"));
        if (ctx.organization.status !== "open") {
          return data({ error: "閉鎖中の結社では発行できません" }, { status: 409 });
        }
        const code = await issueRecoveryCode(db, {
          targetUserId,
          issuedByUserId: auth.user.id,
          via: auth.user.isSystemAdmin && !ctx.role ? "system_admin" : "organization_admin",
          organizationId: orgId,
          issuerIp: clientIp(request),
        });
        return data({ ok: "復旧コードを発行しました", issuedCode: code, targetUserId });
      }
      default:
        return data({ error: "不明な操作です" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof OrgError || e instanceof RecoveryError) {
      return data({ error: e.message }, { status: 409 });
    }
    throw e;
  }
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export default function OrgAdmin({ loaderData, actionData }: Route.ComponentProps) {
  const { org, canAdmin, myUserId, joinRequests, members, recoveryReqs } = loaderData;
  const issuedCode =
    actionData && "issuedCode" in actionData ? (actionData.issuedCode as string) : null;
  const issuedFor =
    actionData && "targetUserId" in actionData ? (actionData.targetUserId as string) : null;
  const issuedForHaigo = members.find((m) => m.userId === issuedFor)?.haigo ?? "";

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">結社管理：{org.name}</h1>

      {actionData && "ok" in actionData && actionData.ok ? (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{actionData.ok}</p>
      ) : null}
      {actionData && "error" in actionData && actionData.error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{actionData.error}</p>
      ) : null}

      {issuedCode ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            <span className="font-medium">{issuedForHaigo}</span>{" "}
            さんの復旧コード（この画面でのみ表示）。
            電話・LINE・対面など、アプリ外で本人にお伝えください。24時間・1回限り有効です。
          </p>
          <p className="mt-2 select-all font-mono text-lg tracking-widest">{issuedCode}</p>
        </div>
      ) : null}

      {/* 結社情報 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">結社情報</h2>
        <Form method="post" className="space-y-3">
          <input type="hidden" name="intent" value="updateOrg" />
          <label className="block">
            <span className="text-sm text-stone-600">結社名</span>
            <input
              name="name"
              defaultValue={org.name}
              required
              maxLength={60}
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-stone-600">説明</span>
            <textarea
              name="description"
              defaultValue={org.description}
              rows={3}
              maxLength={2000}
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-700"
          >
            保存
          </button>
        </Form>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          {org.imageUrl ? (
            <img
              src={org.imageUrl}
              alt=""
              className="size-20 rounded object-cover"
              width={80}
              height={80}
            />
          ) : (
            <div className="grid size-20 place-items-center rounded bg-stone-100 text-xs text-stone-400">
              画像なし
            </div>
          )}
          <Form
            method="post"
            encType="multipart/form-data"
            className="flex flex-wrap items-center gap-3"
          >
            <input type="hidden" name="intent" value="orgImage" />
            <input
              type="file"
              name="image"
              accept="image/png,image/jpeg,image/webp"
              className="text-sm text-stone-600 file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-stone-700 hover:file:bg-stone-200"
            />
            <button
              type="submit"
              className="rounded border border-stone-300 px-3 py-2 text-sm hover:bg-stone-100"
            >
              画像を更新
            </button>
          </Form>
          {org.imageUrl ? (
            <Form method="post">
              <input type="hidden" name="intent" value="deleteOrgImage" />
              <button type="submit" className="text-sm text-stone-500 underline">
                画像を削除
              </button>
            </Form>
          ) : null}
        </div>
      </section>

      {/* 参加申請 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">参加申請（{joinRequests.length}）</h2>
        {joinRequests.length === 0 ? (
          <p className="text-sm text-stone-500">保留中の申請はありません。</p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded border border-stone-200">
            {joinRequests.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-3 py-3 text-sm">
                <div>
                  <div className="font-medium">{r.haigo}</div>
                  <div className="text-stone-500">{r.email}</div>
                  {r.message ? (
                    <p className="mt-1 whitespace-pre-wrap text-stone-600">{r.message}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Form method="post">
                    <input type="hidden" name="intent" value="approveJoin" />
                    <input type="hidden" name="requestId" value={r.id} />
                    <button
                      type="submit"
                      className="rounded bg-stone-900 px-3 py-1 text-white hover:bg-stone-700"
                    >
                      承認
                    </button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="intent" value="rejectJoin" />
                    <input type="hidden" name="requestId" value={r.id} />
                    <button
                      type="submit"
                      className="rounded border border-stone-300 px-3 py-1 text-stone-600 hover:bg-stone-100"
                    >
                      却下
                    </button>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* メンバー */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">メンバー（{members.length}）</h2>
        <ul className="divide-y divide-stone-200 rounded border border-stone-200">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm"
            >
              <div>
                <span className="font-medium">{m.haigo}</span>
                <span className="ml-2 text-stone-500">{ORG_ROLE_LABEL[m.role]}</span>
                <span className="ml-2 text-stone-400">加入 {fmtDate(m.joinedAt)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {canAdmin ? (
                  <Form method="post" className="flex items-center gap-1">
                    <input type="hidden" name="intent" value="setRole" />
                    <input type="hidden" name="targetUserId" value={m.userId} />
                    <select
                      name="role"
                      defaultValue={m.role}
                      className="rounded border border-stone-300 px-2 py-1"
                    >
                      <option value="member">メンバー</option>
                      <option value="deputy_admin">副管理者</option>
                      <option value="admin">管理者</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded border border-stone-300 px-2 py-1 text-stone-600 hover:bg-stone-100"
                    >
                      変更
                    </button>
                  </Form>
                ) : null}
                <Form method="post">
                  <input type="hidden" name="intent" value="issueRecovery" />
                  <input type="hidden" name="targetUserId" value={m.userId} />
                  <button
                    type="submit"
                    className="rounded border border-stone-300 px-2 py-1 text-stone-600 hover:bg-stone-100"
                  >
                    復旧コード発行
                  </button>
                </Form>
                {m.userId !== myUserId ? (
                  <Form
                    method="post"
                    onSubmit={(e) => {
                      if (!confirm(`${m.haigo} さんを退会させます。よろしいですか？`)) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="intent" value="removeMember" />
                    <input type="hidden" name="targetUserId" value={m.userId} />
                    <button type="submit" className="text-stone-500 underline">
                      退会させる
                    </button>
                  </Form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* パスキー復旧依頼 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">パスキー復旧依頼（{recoveryReqs.length}）</h2>
        {recoveryReqs.length === 0 ? (
          <p className="text-sm text-stone-500">
            依頼はありません。メンバー一覧の「復旧コード発行」からも発行できます（本人確認をアプリ外で行うこと）。
          </p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded border border-stone-200">
            {recoveryReqs.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-3 py-3 text-sm">
                <div>
                  <div className="font-medium">{r.haigo}</div>
                  <div className="text-stone-500">{r.email}</div>
                  {r.note ? <p className="mt-1 text-stone-600">{r.note}</p> : null}
                  <div className="text-stone-400">{fmtDate(r.createdAt)}</div>
                </div>
                <Form method="post" className="shrink-0">
                  <input type="hidden" name="intent" value="issueRecovery" />
                  <input type="hidden" name="targetUserId" value={r.userId} />
                  <button
                    type="submit"
                    className="rounded bg-stone-900 px-3 py-1 text-white hover:bg-stone-700"
                  >
                    コード発行
                  </button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 閉鎖・再開 */}
      {canAdmin ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">結社の状態</h2>
          {org.status === "open" ? (
            <Form
              method="post"
              onSubmit={(e) => {
                if (!confirm("結社を閉鎖します。句会は閲覧不可になります。よろしいですか？")) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="close" />
              <button type="submit" className="text-sm text-red-600 underline">
                結社を閉鎖する
              </button>
            </Form>
          ) : (
            <Form method="post">
              <input type="hidden" name="intent" value="reopen" />
              <button type="submit" className="text-sm text-stone-700 underline">
                結社を再開する
              </button>
            </Form>
          )}
        </section>
      ) : null}
    </div>
  );
}
