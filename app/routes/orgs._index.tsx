import { Link } from "react-router";
import { getAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { listOrganizations } from "~/server/orgs.server";
import type { Route } from "./+types/orgs._index";

export const meta: Route.MetaFunction = () => [{ title: "結社一覧 — nQkai" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await getAuth(db, request);
  const organizations = await listOrganizations(db);
  return { organizations, isMember: !!auth };
}

export default function OrgsIndex({ loaderData }: Route.ComponentProps) {
  const { organizations, isMember } = loaderData;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">結社</h1>
        {isMember ? (
          <Link
            to="/orgs/new"
            className="rounded bg-stone-900 px-3 py-1.5 text-sm text-white hover:bg-stone-700"
          >
            結社を作成
          </Link>
        ) : null}
      </div>

      {organizations.length === 0 ? (
        <p className="text-stone-500">まだ結社がありません。</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
          {organizations.map((o) => (
            <li key={o.id} className="px-4 py-3">
              <Link to={`/orgs/${o.id}`} className="font-medium hover:underline">
                {o.name}
              </Link>
              {o.status === "closed" ? (
                <span className="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-600">
                  閉鎖
                </span>
              ) : null}
              <div className="text-sm text-stone-500">
                メンバー {o.memberCount} 名
                {o.description ? ` ／ ${o.description.slice(0, 60)}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
