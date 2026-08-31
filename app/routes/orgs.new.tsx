import { data, Form, redirect } from "react-router";
import { newId } from "~/lib/id";
import { orgCreateSchema } from "~/lib/schemas";
import { requireAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { assertTrustedRequest, firstZodError } from "~/server/http.server";
import { replaceImage, validateImageUpload } from "~/server/images.server";
import { createOrganization, setOrganizationImageKey } from "~/server/orgs.server";
import type { Route } from "./+types/orgs.new";

export const meta: Route.MetaFunction = () => [{ title: "結社を作成 — nQkai" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  await requireAuth(db, request);
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { env, db } = getServerContext(context);
  const auth = await requireAuth(db, request);

  const form = await request.formData();
  const parsed = orgCreateSchema.safeParse({
    name: form.get("name"),
    description: form.get("description") ?? "",
  });
  if (!parsed.success) {
    return data({ error: firstZodError(parsed.error) }, { status: 422 });
  }

  // 画像は任意。指定があれば検証する（本作成前にエラーを返す）
  const imageEntry = form.get("image");
  const hasImage = imageEntry instanceof File && imageEntry.size > 0;
  if (hasImage) {
    const v = validateImageUpload(imageEntry);
    if ("error" in v) return data({ error: v.error }, { status: 422 });
  }

  const orgId = await createOrganization(db, auth.user.id, parsed.data);

  if (hasImage) {
    const key = `orgs/${orgId}/${newId()}`;
    await replaceImage(env.BUCKET, key, imageEntry as File, null);
    await setOrganizationImageKey(db, orgId, key);
  }

  return redirect(`/orgs/${orgId}`);
}

export default function OrgNew({ actionData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-mincho text-xl font-medium tracking-wide">結社を作成</h1>
      <p className="text-sm text-sumi-soft">作成者はその結社の管理者になります。</p>

      <Form method="post" encType="multipart/form-data" className="space-y-4">
        <label className="block">
          <span className="text-sm text-sumi-soft">結社名</span>
          <input
            name="name"
            required
            maxLength={60}
            className="mt-1 w-full rounded border border-rule px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm text-sumi-soft">説明（任意）</span>
          <textarea
            name="description"
            rows={4}
            maxLength={2000}
            className="mt-1 w-full rounded border border-rule px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm text-sumi-soft">画像（任意・PNG / JPEG / WebP・2MB まで）</span>
          <input
            type="file"
            name="image"
            accept="image/png,image/jpeg,image/webp"
            className="mt-1 block text-sm text-sumi-soft file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-washi-edge file:px-3 file:py-1.5 file:text-sumi hover:file:bg-washi-edge"
          />
        </label>
        {actionData?.error ? <p className="text-sm text-red-600">{actionData.error}</p> : null}
        <button type="submit" className="rounded bg-ai px-4 py-2 text-washi hover:bg-ai-deep">
          作成
        </button>
      </Form>
    </div>
  );
}
