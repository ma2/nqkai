import { and, asc, eq, inArray } from "drizzle-orm";
import { useRef, useState } from "react";
import { data, Form, Link, redirect, useRevalidator } from "react-router";
import { ORG_ROLE_LABEL } from "~/lib/constants";
import { newId } from "~/lib/id";
import { profileUpdateSchema } from "~/lib/schemas";
import { addPasskey } from "~/lib/webauthn-client";
import {
  buildClearSessionCookie,
  destroyAllUserSessions,
  destroySession,
  requireAuth,
} from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import {
  organizationMemberships,
  organizations,
  users,
  webauthnCredentials,
} from "~/server/db/schema";
import { assertTrustedRequest, firstZodError } from "~/server/http.server";
import type { Route } from "./+types/settings";

export const meta: Route.MetaFunction = () => [{ title: "設定 — nQkai" }];

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);

  const credentials = await db
    .select({
      id: webauthnCredentials.id,
      deviceName: webauthnCredentials.deviceName,
      createdAt: webauthnCredentials.createdAt,
      lastUsedAt: webauthnCredentials.lastUsedAt,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, auth.user.id))
    .orderBy(asc(webauthnCredentials.createdAt))
    .all();

  const managedOrgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      role: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(
      and(
        eq(organizationMemberships.userId, auth.user.id),
        inArray(organizationMemberships.role, ["admin", "deputy_admin"]),
      ),
    )
    .orderBy(organizations.name)
    .all();

  return {
    user: {
      id: auth.user.id,
      haigo: auth.user.haigo,
      email: auth.user.email,
      isSystemAdmin: auth.user.isSystemAdmin,
      avatarUrl: auth.user.avatarKey
        ? `/api/avatars/${auth.user.id}?v=${auth.user.updatedAt.getTime()}`
        : null,
    },
    credentials,
    managedOrgs,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { env, db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  switch (intent) {
    case "logout": {
      await destroySession(db, auth.sessionId);
      return redirect("/login", { headers: { "set-cookie": buildClearSessionCookie() } });
    }

    case "logoutAll": {
      await destroyAllUserSessions(db, auth.user.id);
      return redirect("/login", { headers: { "set-cookie": buildClearSessionCookie() } });
    }

    case "updateProfile": {
      const parsed = profileUpdateSchema.safeParse({ haigo: form.get("haigo") });
      if (!parsed.success) {
        return data({ error: firstZodError(parsed.error) }, { status: 422 });
      }
      await db
        .update(users)
        .set({ haigo: parsed.data.haigo, updatedAt: new Date() })
        .where(eq(users.id, auth.user.id));
      return data({ ok: "俳号を更新しました" });
    }

    case "deleteCredential": {
      const credentialId = String(form.get("credentialId") ?? "");
      const all = await db
        .select({ id: webauthnCredentials.id })
        .from(webauthnCredentials)
        .where(eq(webauthnCredentials.userId, auth.user.id))
        .all();
      if (all.length <= 1) {
        return data({ error: "最後のパスキーは削除できません" }, { status: 409 });
      }
      if (!all.some((c) => c.id === credentialId)) {
        return data({ error: "対象のパスキーが見つかりません" }, { status: 404 });
      }
      await db.delete(webauthnCredentials).where(eq(webauthnCredentials.id, credentialId));
      return data({ ok: "パスキーを削除しました" });
    }

    case "avatar": {
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return data({ error: "画像ファイルを選択してください" }, { status: 422 });
      }
      if (!AVATAR_TYPES.includes(file.type)) {
        return data({ error: "PNG / JPEG / WebP のみ対応しています" }, { status: 422 });
      }
      if (file.size > AVATAR_MAX_BYTES) {
        return data({ error: "画像は 2MB 以下にしてください" }, { status: 422 });
      }
      const key = `avatars/${auth.user.id}/${newId()}`;
      await env.BUCKET.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type },
      });
      const prev = auth.user.avatarKey;
      await db
        .update(users)
        .set({ avatarKey: key, updatedAt: new Date() })
        .where(eq(users.id, auth.user.id));
      if (prev) await env.BUCKET.delete(prev);
      return data({ ok: "プロフィール画像を更新しました" });
    }

    case "deleteAvatar": {
      if (auth.user.avatarKey) await env.BUCKET.delete(auth.user.avatarKey);
      await db
        .update(users)
        .set({ avatarKey: null, updatedAt: new Date() })
        .where(eq(users.id, auth.user.id));
      return data({ ok: "プロフィール画像を削除しました" });
    }

    case "deleteAccount": {
      if (auth.user.avatarKey) await env.BUCKET.delete(auth.user.avatarKey);
      // フェーズ1では保全すべき投句等が無いため物理削除（sessions / credentials は FK カスケード）。
      // 投句機能追加後は論理的な無効化に切り替える。
      await db.delete(users).where(eq(users.id, auth.user.id));
      return redirect("/", { headers: { "set-cookie": buildClearSessionCookie() } });
    }

    default:
      return data({ error: "不明な操作です" }, { status: 400 });
  }
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function credentialLabel(c: { deviceName: string | null; createdAt: Date }): string {
  if (c.deviceName) return c.deviceName;
  return `パスキー（登録 ${new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(c.createdAt)}）`;
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { user, credentials, managedOrgs } = loaderData;
  const revalidator = useRevalidator();
  const deviceNameRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function onAddPasskey() {
    const deviceName = deviceNameRef.current?.value.trim() ?? "";
    setAdding(true);
    setAddError(null);
    try {
      await addPasskey(deviceName ? { deviceName } : {});
      if (deviceNameRef.current) deviceNameRef.current.value = "";
      revalidator.revalidate();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "パスキーの追加に失敗しました");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">設定</h1>

      {actionData && "ok" in actionData && actionData.ok ? (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{actionData.ok}</p>
      ) : null}
      {actionData && "error" in actionData && actionData.error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{actionData.error}</p>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">プロフィール</h2>
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="size-16 rounded-full object-cover"
              width={64}
              height={64}
            />
          ) : (
            <div className="grid size-16 place-items-center rounded-full bg-stone-200 text-stone-500">
              {user.haigo.slice(0, 1)}
            </div>
          )}
          <div className="space-y-1">
            <div className="text-sm text-stone-500">{user.email}</div>
            <div className="flex flex-wrap gap-1.5">
              {user.isSystemAdmin ? (
                <span className="rounded bg-stone-900 px-2 py-0.5 text-xs text-white">
                  システム管理者
                </span>
              ) : null}
              {managedOrgs.map((o) => (
                <Link
                  key={o.id}
                  to={`/orgs/${o.id}/admin`}
                  className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-700 hover:bg-stone-200"
                >
                  {o.name}・{ORG_ROLE_LABEL[o.role]}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <Form method="post" className="flex items-end gap-3">
          <input type="hidden" name="intent" value="updateProfile" />
          <label className="block flex-1">
            <span className="text-sm text-stone-600">俳号</span>
            <input
              name="haigo"
              defaultValue={user.haigo}
              maxLength={30}
              required
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-stone-900 px-4 py-2 text-white hover:bg-stone-700"
          >
            保存
          </button>
        </Form>

        <Form
          method="post"
          encType="multipart/form-data"
          className="flex flex-wrap items-center gap-3"
        >
          <input type="hidden" name="intent" value="avatar" />
          <input
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp"
            className="text-sm text-stone-600 file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-stone-700 hover:file:bg-stone-200"
          />
          <button
            type="submit"
            className="rounded border border-stone-300 px-3 py-2 text-sm hover:bg-stone-100"
          >
            画像を更新
          </button>
          {user.avatarUrl ? (
            <Form method="post">
              <input type="hidden" name="intent" value="deleteAvatar" />
              <button type="submit" className="text-sm text-stone-500 underline">
                画像を削除
              </button>
            </Form>
          ) : null}
        </Form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">パスキー</h2>
        <ul className="divide-y divide-stone-200 rounded border border-stone-200">
          {credentials.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{credentialLabel(c)}</div>
                <div className="text-stone-500">
                  登録 {fmtDate(c.createdAt)} ／ 最終利用 {fmtDate(c.lastUsedAt)}
                </div>
              </div>
              <Form method="post">
                <input type="hidden" name="intent" value="deleteCredential" />
                <input type="hidden" name="credentialId" value={c.id} />
                <button
                  type="submit"
                  disabled={credentials.length <= 1}
                  className="text-stone-500 underline disabled:opacity-40"
                >
                  削除
                </button>
              </Form>
            </li>
          ))}
        </ul>

        <div className="flex items-end gap-3">
          <label className="block flex-1">
            <span className="text-sm text-stone-600">デバイス名（任意）</span>
            <input
              ref={deviceNameRef}
              maxLength={50}
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={() => void onAddPasskey()}
            disabled={adding}
            className="rounded border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100 disabled:opacity-50"
          >
            {adding ? "追加中…" : "このデバイスのパスキーを追加"}
          </button>
        </div>
        {addError ? <p className="text-sm text-red-600">{addError}</p> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">アカウント</h2>
        <Form method="post">
          <input type="hidden" name="intent" value="logoutAll" />
          <button type="submit" className="text-sm text-stone-700 underline">
            すべての端末からログアウト
          </button>
        </Form>
        <Form
          method="post"
          onSubmit={(e) => {
            if (!confirm("アカウントを削除します。よろしいですか？")) e.preventDefault();
          }}
        >
          <input type="hidden" name="intent" value="deleteAccount" />
          <button type="submit" className="text-sm text-red-600 underline">
            アカウントを削除
          </button>
        </Form>
      </section>
    </div>
  );
}
