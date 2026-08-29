import { eq } from "drizzle-orm";
import { credentialStartSchema } from "~/lib/schemas";
import { getAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { webauthnCredentials } from "~/server/db/schema";
import { assertTrustedRequest } from "~/server/http.server";
import { startRegistration } from "~/server/webauthn.server";
import type { Route } from "./+types/api.auth.credentials.options";

export async function action({ request, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { env, db } = getServerContext(context);

  const auth = await getAuth(db, request);
  if (!auth) {
    return Response.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const parsed = credentialStartSchema.safeParse(await request.json().catch(() => ({})));
  const deviceName = parsed.success ? parsed.data.deviceName : undefined;

  const existing = await db
    .select({
      id: webauthnCredentials.id,
      publicKey: webauthnCredentials.publicKey,
      counter: webauthnCredentials.counter,
      transports: webauthnCredentials.transports,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, auth.user.id))
    .all();

  const { tempId, options } = await startRegistration(env, {
    mode: "add",
    userId: auth.user.id,
    email: auth.user.email,
    haigo: auth.user.haigo,
    existing,
    deviceName,
  });
  return Response.json({ tempId, options });
}
