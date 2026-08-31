import { KukaiList } from "~/components/KukaiList";
import { requireAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { listActiveKukaiForUser, listPastKukaiForUser } from "~/server/kukai.server";
import type { Route } from "./+types/kukai._index";

export const meta: Route.MetaFunction = () => [{ title: "句会 — nQkai" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const [active, past] = await Promise.all([
    listActiveKukaiForUser(db, auth.user.id),
    listPastKukaiForUser(db, auth.user.id),
  ]);
  return { active, past };
}

export default function KukaiIndex({ loaderData }: Route.ComponentProps) {
  const { active, past } = loaderData;
  return (
    <div className="space-y-8">
      <h1 className="font-mincho text-2xl font-medium tracking-wide">句会</h1>

      <section className="space-y-2">
        <h2 className="font-mincho text-lg font-medium">進行中の句会</h2>
        <KukaiList items={active} empty="進行中の句会はありません。" />
      </section>

      <section className="space-y-2">
        <h2 className="font-mincho text-lg font-medium">過去の句会</h2>
        <KukaiList items={past} empty="過去の句会はありません。" />
      </section>
    </div>
  );
}
