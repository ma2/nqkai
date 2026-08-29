import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { createMemberSession } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { users, webauthnCredentials } from "~/server/db/schema";
import { assertTrustedRequest } from "~/server/http.server";
import { finishAuthentication } from "~/server/webauthn.server";
import type { Route } from "./+types/api.auth.login.verify";

export async function action({ request, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { env, db } = getServerContext(context);

  const body = (await request.json().catch(() => null)) as {
    tempId?: string;
    response?: AuthenticationResponseJSON;
  } | null;
  if (!body?.tempId || !body.response) {
    return Response.json({ error: "リクエストが不正です" }, { status: 422 });
  }

  const cred = await db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.id, body.response.id))
    .get();
  if (!cred) {
    return Response.json({ error: "認証に失敗しました" }, { status: 400 });
  }

  const verification = await finishAuthentication(env, body.tempId, body.response, cred);
  if (!verification.verified) {
    return Response.json({ error: "認証に失敗しました" }, { status: 400 });
  }

  const user = await db.select().from(users).where(eq(users.id, cred.userId)).get();
  if (!user || user.status === "suspended") {
    return Response.json({ error: "このアカウントは利用できません" }, { status: 403 });
  }

  await db
    .update(webauthnCredentials)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(webauthnCredentials.id, cred.id));

  const { setCookie } = await createMemberSession(db, user.id, request);
  return Response.json({ ok: true }, { headers: { "set-cookie": setCookie } });
}
