import { Link } from "react-router";
import { ORG_ROLE_LABEL } from "~/lib/constants";
import { requireAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { countUnread } from "~/server/notifications.server";
import { listMyOrganizations } from "~/server/orgs.server";
import type { Route } from "./+types/_index";

export const meta: Route.MetaFunction = () => [{ title: "ダッシュボード — nQkai" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const [orgs, unread] = await Promise.all([
    listMyOrganizations(db, auth.user.id),
    countUnread(db, auth.user.id),
  ]);
  return { haigo: auth.user.haigo, orgs, unread };
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { haigo, orgs, unread } = loaderData;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">ようこそ、{haigo} さん</h1>

      {unread > 0 ? (
        <p className="rounded bg-stone-100 px-3 py-2 text-sm">
          未読の通知が {unread} 件あります。{" "}
          <Link to="/notifications" className="underline">
            確認する
          </Link>
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">所属する結社</h2>
          <Link to="/orgs" className="text-sm text-stone-600 underline">
            結社をさがす
          </Link>
        </div>
        {orgs.length === 0 ? (
          <p className="text-sm text-stone-500">
            まだ結社に所属していません。
            <Link to="/orgs" className="ml-1 underline">
              一覧から参加を申請
            </Link>
            するか、
            <Link to="/orgs/new" className="ml-1 underline">
              新しく作成
            </Link>
            できます。
          </p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
            {orgs.map((o) => (
              <li key={o.id} className="flex items-center justify-between px-4 py-3">
                <Link to={`/orgs/${o.id}`} className="font-medium hover:underline">
                  {o.name}
                  {o.status === "closed" ? (
                    <span className="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-600">
                      閉鎖
                    </span>
                  ) : null}
                </Link>
                <span className="text-sm text-stone-500">{ORG_ROLE_LABEL[o.role]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">進行中の句会</h2>
        <p className="text-sm text-stone-500">句会機能は準備中です（フェーズ3）。</p>
      </section>

      <p>
        <Link to="/settings" className="text-sm text-stone-700 underline">
          プロフィール・パスキーの設定
        </Link>
      </p>
    </div>
  );
}
