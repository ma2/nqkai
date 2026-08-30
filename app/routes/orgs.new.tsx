import { data, Form, redirect } from "react-router";
import { orgCreateSchema } from "~/lib/schemas";
import { requireAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { assertTrustedRequest, firstZodError } from "~/server/http.server";
import { createOrganization } from "~/server/orgs.server";
import type { Route } from "./+types/orgs.new";

export const meta: Route.MetaFunction = () => [{ title: "結社を作成 — nQkai" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  await requireAuth(db, request);
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);

  const form = await request.formData();
  const parsed = orgCreateSchema.safeParse({
    name: form.get("name"),
    description: form.get("description") ?? "",
  });
  if (!parsed.success) {
    return data({ error: firstZodError(parsed.error) }, { status: 422 });
  }

  const orgId = await createOrganization(db, auth.user.id, parsed.data);
  return redirect(`/orgs/${orgId}`);
}

export default function OrgNew({ actionData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-xl font-bold">結社を作成</h1>
      <p className="text-sm text-stone-500">作成者はその結社の管理者になります。</p>

      <Form method="post" className="space-y-4">
        <label className="block">
          <span className="text-sm text-stone-600">結社名</span>
          <input
            name="name"
            required
            maxLength={60}
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm text-stone-600">説明（任意）</span>
          <textarea
            name="description"
            rows={4}
            maxLength={2000}
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        {actionData?.error ? <p className="text-sm text-red-600">{actionData.error}</p> : null}
        <button
          type="submit"
          className="rounded bg-stone-900 px-4 py-2 text-white hover:bg-stone-700"
        >
          作成
        </button>
      </Form>
    </div>
  );
}
