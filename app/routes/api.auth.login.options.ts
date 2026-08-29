import { eq } from "drizzle-orm";
import { loginStartSchema } from "~/lib/schemas";
import { getServerContext } from "~/server/context.server";
import { users, webauthnCredentials } from "~/server/db/schema";
import { assertTrustedRequest, firstZodError } from "~/server/http.server";
import { type StoredCredential, startAuthentication } from "~/server/webauthn.server";
import type { Route } from "./+types/api.auth.login.options";

export async function action({ request, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { env, db } = getServerContext(context);

  const parsed = loginStartSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 422 });
  }

  // メール未指定、または未登録メールでも同じ形のレスポンスを返す（ユーザー列挙対策）。
  let allow: StoredCredential[] = [];
  if (parsed.data.email) {
    const user = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .get();
    if (user) {
      allow = await db
        .select({
          id: webauthnCredentials.id,
          publicKey: webauthnCredentials.publicKey,
          counter: webauthnCredentials.counter,
          transports: webauthnCredentials.transports,
        })
        .from(webauthnCredentials)
        .where(eq(webauthnCredentials.userId, user.id))
        .all();
    }
  }

  const { tempId, options } = await startAuthentication(env, allow);
  return Response.json({ tempId, options });
}
