import { Link } from "react-router";
import { KUKAI_PHASE_LABEL, ORG_ROLE_LABEL } from "~/lib/constants";
import { requireAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { listActiveKukaiForUser } from "~/server/kukai.server";
import { countUnread } from "~/server/notifications.server";
import { listMyOrganizations } from "~/server/orgs.server";
import type { Route } from "./+types/_index";

export const meta: Route.MetaFunction = () => [{ title: "ダッシュボード — nQkai" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const [orgs, unread, kukai] = await Promise.all([
    listMyOrganizations(db, auth.user.id),
    countUnread(db, auth.user.id),
    listActiveKukaiForUser(db, auth.user.id),
  ]);
  return { haigo: auth.user.haigo, orgs, unread, kukai };
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { haigo, orgs, unread, kukai } = loaderData;
  return (
    <div className="space-y-8">
      <h1 className="font-mincho text-2xl font-medium tracking-wide">ようこそ、{haigo} さん</h1>

      {unread > 0 ? (
        <p className="rounded bg-washi-edge px-3 py-2 text-sm">
          未読の通知が {unread} 件あります。{" "}
          <Link to="/notifications" className="underline">
            確認する
          </Link>
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mincho text-lg font-medium">所属する結社</h2>
          <Link to="/orgs" className="text-sm text-sumi-soft underline">
            結社をさがす
          </Link>
        </div>
        {orgs.length === 0 ? (
          <p className="text-sm text-sumi-soft">
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
          <ul className="divide-y divide-rule rounded border border-rule bg-transparent">
            {orgs.map((o) => (
              <li key={o.id} className="flex items-center justify-between px-4 py-3">
                <Link to={`/orgs/${o.id}`} className="font-medium hover:underline">
                  {o.name}
                  {o.status === "closed" ? (
                    <span className="ml-2 rounded bg-washi-edge px-1.5 py-0.5 text-xs text-sumi-soft">
                      閉鎖
                    </span>
                  ) : null}
                </Link>
                <span className="text-sm text-sumi-soft">{ORG_ROLE_LABEL[o.role]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-mincho text-lg font-medium">進行中の句会</h2>
        {kukai.length === 0 ? (
          <p className="text-sm text-sumi-soft">進行中の句会はありません。</p>
        ) : (
          <ul className="divide-y divide-rule rounded border border-rule bg-transparent">
            {kukai.map((kk) => (
              <li key={kk.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <Link to={`/kukai/${kk.id}`} className="font-medium hover:underline">
                  {kk.name}
                  <span className="ml-2 text-sumi-soft">{kk.orgName}</span>
                </Link>
                <span className="text-sumi-soft">
                  {KUKAI_PHASE_LABEL[kk.phase as keyof typeof KUKAI_PHASE_LABEL] ?? kk.phase}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p>
        <Link to="/settings" className="text-sm text-sumi underline">
          プロフィール・パスキーの設定
        </Link>
      </p>
    </div>
  );
}
