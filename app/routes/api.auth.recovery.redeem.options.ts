import { eq } from "drizzle-orm";
import { recoveryRedeemStartSchema } from "~/lib/schemas";
import { getServerContext } from "~/server/context.server";
import { webauthnCredentials } from "~/server/db/schema";
import { assertTrustedRequest, firstZodError } from "~/server/http.server";
import { RecoveryError, verifyRecoveryCode } from "~/server/recovery.server";
import { startRegistration } from "~/server/webauthn.server";
import type { Route } from "./+types/api.auth.recovery.redeem.options";

export async function action({ request, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { env, db } = getServerContext(context);

  const parsed = recoveryRedeemStartSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 422 });
  }

  try {
    const { user, codeId } = await verifyRecoveryCode(db, parsed.data.email, parsed.data.code);

    const existing = await db
      .select({
        id: webauthnCredentials.id,
        publicKey: webauthnCredentials.publicKey,
        counter: webauthnCredentials.counter,
        transports: webauthnCredentials.transports,
      })
      .from(webauthnCredentials)
      .where(eq(webauthnCredentials.userId, user.id))
      .all();

    const { tempId, options } = await startRegistration(env, {
      mode: "recover",
      userId: user.id,
      email: parsed.data.email,
      haigo: user.haigo,
      existing,
      codeId,
    });
    return Response.json({ tempId, options });
  } catch (e) {
    if (e instanceof RecoveryError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
