import { data, Form, Link } from "react-router";
import { notificationMessage } from "~/lib/notifications";
import { requireAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { assertTrustedRequest } from "~/server/http.server";
import { listNotifications, markAllRead, markRead } from "~/server/notifications.server";
import type { Route } from "./+types/notifications";

export const meta: Route.MetaFunction = () => [{ title: "通知 — nQkai" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const items = await listNotifications(db, auth.user.id);
  return {
    items: items.map((n) => {
      const payload = JSON.parse(n.payload) as Record<string, unknown>;
      return {
        id: n.id,
        type: n.type,
        message: notificationMessage(n.type, payload),
        payload,
        readAt: n.readAt,
        createdAt: n.createdAt,
      };
    }),
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
  if (typeof payload.kukaiId === "string") return `/kukai/${payload.kukaiId}`;
  if (typeof payload.organizationId === "string") return `/orgs/${payload.organizationId}`;
  return null;
}

export default function Notifications({ loaderData }: Route.ComponentProps) {
  const { items } = loaderData;
  const hasUnread = items.some((n) => !n.readAt);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mincho text-2xl font-medium tracking-wide">通知</h1>
        {hasUnread ? (
          <Form method="post">
            <input type="hidden" name="intent" value="readAll" />
            <button type="submit" className="text-sm text-sumi-soft underline">
              すべて既読にする
            </button>
          </Form>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="text-sumi-soft">通知はありません。</p>
      ) : (
        <ul className="divide-y divide-rule rounded border border-rule bg-transparent">
          {items.map((n) => {
            const href = linkFor(n.payload);
            return (
              <li
                key={n.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${n.readAt ? "text-sumi-soft" : ""}`}
              >
                <div>
                  {!n.readAt ? (
                    <span className="mr-2 inline-block size-2 rounded-full bg-ai align-middle" />
                  ) : null}
                  {href ? (
                    <Link to={href} className="hover:underline">
                      {n.message}
                    </Link>
                  ) : (
                    n.message
                  )}
                  <span className="ml-2 text-sumi-soft">{fmt(n.createdAt)}</span>
                </div>
                {!n.readAt ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="read" />
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="shrink-0 text-sumi-soft underline">
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
