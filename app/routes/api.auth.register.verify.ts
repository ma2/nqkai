import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { newToken } from "~/lib/id";
import { createMemberSession } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { users, webauthnCredentials } from "~/server/db/schema";
import { assertTrustedRequest } from "~/server/http.server";
import { finishRegistration } from "~/server/webauthn.server";
import type { Route } from "./+types/api.auth.register.verify";

export async function action({ request, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { env, db } = getServerContext(context);

  const body = (await request.json().catch(() => null)) as {
    tempId?: string;
    response?: RegistrationResponseJSON;
  } | null;
  if (!body?.tempId || !body.response) {
    return Response.json({ error: "リクエストが不正です" }, { status: 422 });
  }

  const { pending, credential } = await finishRegistration(env, body.tempId, body.response);

  try {
    await db.batch([
      db.insert(users).values({
        id: pending.userId,
        publicId: newToken(16),
        email: pending.email,
        haigo: pending.haigo,
      }),
      db.insert(webauthnCredentials).values({
        id: credential.id,
        userId: pending.userId,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports,
        deviceName: pending.deviceName ?? null,
      }),
    ]);
  } catch {
    return Response.json(
      { error: "登録に失敗しました。既に登録済みの可能性があります" },
      { status: 409 },
    );
  }

  const { setCookie } = await createMemberSession(db, pending.userId, request);
  return Response.json({ ok: true }, { headers: { "set-cookie": setCookie } });
}
