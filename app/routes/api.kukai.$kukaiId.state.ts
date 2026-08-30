import { getAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { getKukaiState, loadKukaiContext } from "~/server/kukai.server";
import type { Route } from "./+types/api.kukai.$kukaiId.state";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await getAuth(db, request);
  // 閲覧権限チェック（404 を throw する）
  await loadKukaiContext(
    db,
    params.kukaiId,
    auth?.user.id ?? null,
    auth?.user.isSystemAdmin ?? false,
  );

  const state = await getKukaiState(db, params.kukaiId);
  if (!state) throw new Response(null, { status: 404 });
  return Response.json(state, { headers: { "cache-control": "no-store" } });
}
