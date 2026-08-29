import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { getAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { webauthnCredentials } from "~/server/db/schema";
import { assertTrustedRequest } from "~/server/http.server";
import { finishRegistration } from "~/server/webauthn.server";
import type { Route } from "./+types/api.auth.credentials.verify";

export async function action({ request, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { env, db } = getServerContext(context);

  const auth = await getAuth(db, request);
  if (!auth) {
    return Response.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    tempId?: string;
    response?: RegistrationResponseJSON;
  } | null;
  if (!body?.tempId || !body.response) {
    return Response.json({ error: "リクエストが不正です" }, { status: 422 });
  }

  const { pending, credential } = await finishRegistration(env, body.tempId, body.response);
  if (pending.userId !== auth.user.id) {
    return Response.json({ error: "登録セッションが一致しません" }, { status: 400 });
  }

  try {
    await db.insert(webauthnCredentials).values({
      id: credential.id,
      userId: auth.user.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports,
      deviceName: pending.deviceName ?? null,
    });
  } catch {
    return Response.json({ error: "このパスキーは既に登録されています" }, { status: 409 });
  }

  return Response.json({ ok: true });
}
