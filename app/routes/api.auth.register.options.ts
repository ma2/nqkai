import { eq } from "drizzle-orm";
import { registerStartSchema } from "~/lib/schemas";
import { getServerContext } from "~/server/context.server";
import { users } from "~/server/db/schema";
import { assertTrustedRequest, firstZodError } from "~/server/http.server";
import { startRegistration } from "~/server/webauthn.server";
import type { Route } from "./+types/api.auth.register.options";

export async function action({ request, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { env, db } = getServerContext(context);

  const parsed = registerStartSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: firstZodError(parsed.error) }, { status: 422 });
  }
  const { email, haigo } = parsed.data;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .get();
  if (existing) {
    return Response.json({ error: "このメールアドレスは既に登録されています" }, { status: 409 });
  }

  const { tempId, options } = await startRegistration(env, { mode: "new", email, haigo });
  return Response.json({ tempId, options });
}
