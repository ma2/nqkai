import { data, Form, Link } from "react-router";
import { requireAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { assertTrustedRequest } from "~/server/http.server";
import { listNotifications, markAllRead, markRead } from "~/server/notifications.server";
import type { Route } from "./+types/notifications";

export const meta: Route.MetaFunction = () => [{ title: "通知 — nQkai" }];

const MESSAGES: Record<string, string> = {
  join_request_received: "結社への参加申請が届きました",
  join_approved: "結社への参加が承認されました",
  join_rejected: "結社への参加申請が却下されました",
  member_removed: "結社から退会処理されました",
  role_changed: "結社での役割が変更されました",
  organization_closed: "結社が閉鎖されました",
  recovery_requested: "パスキー復旧の依頼が届きました",
  recovery_code_issued: "パスキー復旧コードが発行されました",
  recovery_code_used: "パスキー復旧コードが使用されました",
  phase_changed: "句会のフェーズが変わりました",
  kukai_deleted: "句会が削除されました",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const items = await listNotifications(db, auth.user.id);
  return {
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      message: MESSAGES[n.type] ?? n.type,
      payload: JSON.parse(n.payload) as Record<string, unknown>,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "readAll") {
    await markAllRead(db, auth.user.id);
  } else if (intent === "read") {
    await markRead(db, auth.user.id, [String(form.get("id"))]);
  }
  return data({ ok: true });
}

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function linkFor(payload: Record<string, unknown>): string | null {
  if (typeof payload.organizationId === "string") return `/orgs/${payload.organizationId}`;
  return null;
}

export default function Notifications({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;
  const hasUnread = items.some((n) => !n.readAt);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">通知</h1>
        {hasUnread ? (
          <Form method="post">
            <input type="hidden" name="intent" value="readAll" />
            <button type="submit" className="text-sm text-stone-600 underline">
              すべて既読にする
            </button>
          </Form>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="text-stone-500">通知はありません。</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
          {items.map((n) => {
            const href = linkFor(n.payload);
            return (
              <li
                key={n.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${n.readAt ? "text-stone-500" : ""}`}
              >
                <div>
                  {!n.readAt ? (
                    <span className="mr-2 inline-block size-2 rounded-full bg-stone-900 align-middle" />
                  ) : null}
                  {href ? (
                    <Link to={href} className="hover:underline">
                      {n.message}
                    </Link>
                  ) : (
                    n.message
                  )}
                  <span className="ml-2 text-stone-400">{fmt(n.createdAt)}</span>
                </div>
                {!n.readAt ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="read" />
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="shrink-0 text-stone-400 underline">
                      既読
                    </button>
                  </Form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
