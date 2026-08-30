import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { deviceLabelFromUA } from "~/lib/ua";
import { createMemberSession } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { accountRecoveryCodes, webauthnCredentials } from "~/server/db/schema";
import { assertTrustedRequest, clientIp } from "~/server/http.server";
import { finalizeRecovery } from "~/server/recovery.server";
import { finishRegistration } from "~/server/webauthn.server";
import type { Route } from "./+types/api.auth.recovery.redeem.verify";

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
  if (!pending.codeId) {
    return Response.json({ error: "復旧セッションが不正です" }, { status: 400 });
  }

  // コードがこの間に使われた/失効した可能性を再チェック
  const code = await db
    .select()
    .from(accountRecoveryCodes)
    .where(eq(accountRecoveryCodes.id, pending.codeId))
    .get();
  if (
    !code ||
    code.userId !== pending.userId ||
    code.usedAt != null ||
    code.expiresAt.getTime() <= Date.now()
  ) {
    return Response.json(
      { error: "コードが無効です。発行者に再発行を依頼してください" },
      {
        status: 409,
      },
    );
  }

  try {
    await db.insert(webauthnCredentials).values({
      id: credential.id,
      userId: pending.userId,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports,
      deviceName: deviceLabelFromUA(request.headers.get("user-agent")),
    });
  } catch {
    return Response.json({ error: "このパスキーは既に登録されています" }, { status: 409 });
  }

  await finalizeRecovery(db, {
    codeId: pending.codeId,
    userId: pending.userId,
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  });

  const { setCookie } = await createMemberSession(db, pending.userId, request);
  return Response.json({ ok: true }, { headers: { "set-cookie": setCookie } });
}
