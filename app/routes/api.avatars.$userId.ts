import { eq } from "drizzle-orm";
import { getServerContext } from "~/server/context.server";
import { users } from "~/server/db/schema";
import type { Route } from "./+types/api.avatars.$userId";

export async function loader({ params, context }: Route.LoaderArgs) {
  const { env, db } = getServerContext(context);

  const row = await db
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, params.userId))
    .get();
  if (!row?.avatarKey) {
    throw new Response(null, { status: 404 });
  }

  const object = await env.BUCKET.get(row.avatarKey);
  if (!object) {
    throw new Response(null, { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=300",
      etag: object.httpEtag,
    },
  });
}
