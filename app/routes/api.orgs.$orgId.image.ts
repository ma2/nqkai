import { getServerContext } from "~/server/context.server";
import { streamImage } from "~/server/images.server";
import { getOrganizationImageKey } from "~/server/orgs.server";
import type { Route } from "./+types/api.orgs.$orgId.image";

export async function loader({ params, context }: Route.LoaderArgs) {
  const { env, db } = getServerContext(context);
  const key = await getOrganizationImageKey(db, params.orgId);
  if (!key) throw new Response(null, { status: 404 });
  return streamImage(env.BUCKET, key);
}
