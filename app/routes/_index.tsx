import { Link } from "react-router";
import { requireAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import type { Route } from "./+types/_index";

export const meta: Route.MetaFunction = () => [{ title: "ダッシュボード — nQkai" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  return { haigo: auth.user.haigo };
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="text-sm font-medium text-stone-500">{title}</h2>
      <p className="mt-1 text-stone-800">{body}</p>
    </div>
  );
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ようこそ、{loaderData.haigo} さん</h1>
      <p className="text-stone-600">
        結社・句会の機能は現在準備中です（フェーズ2以降で追加されます）。
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="所属する結社" body="まだありません" />
        <Card title="進行中の句会" body="まだありません" />
      </div>
      <p>
        <Link to="/settings" className="text-sm text-stone-700 underline">
          プロフィール・パスキーの設定
        </Link>
      </p>
    </div>
  );
}
