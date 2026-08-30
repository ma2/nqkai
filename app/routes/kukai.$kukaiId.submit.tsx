import { data, Form, Link } from "react-router";
import { KUKAI_PHASE_LABEL } from "~/lib/constants";
import { submissionSchema } from "~/lib/schemas";
import { requireAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { assertTrustedRequest, firstZodError } from "~/server/http.server";
import { KukaiError, loadKukaiContext } from "~/server/kukai.server";
import {
  addSubmission,
  deleteSubmission,
  listMySubmissions,
  updateSubmission,
} from "~/server/submissions.server";
import type { Route } from "./+types/kukai.$kukaiId.submit";

export const meta: Route.MetaFunction = () => [{ title: "投句 — nQkai" }];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const ctx = await loadKukaiContext(db, params.kukaiId, auth.user.id, auth.user.isSystemAdmin);
  if (!ctx.canParticipate) throw new Response("この句会には参加できません", { status: 403 });

  const mine = await listMySubmissions(db, ctx.kukai.id, auth.user.id);
  return {
    kukaiId: ctx.kukai.id,
    name: ctx.kukai.name,
    theme: ctx.kukai.theme,
    phase: ctx.kukai.phase,
    limit: ctx.kukai.submissionsPerUser,
    mine,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const ctx = await loadKukaiContext(db, params.kukaiId, auth.user.id, auth.user.isSystemAdmin);
  if (!ctx.canParticipate) throw new Response(null, { status: 403 });

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  try {
    if (intent === "add" || intent === "edit") {
      const parsed = submissionSchema.safeParse({ content: form.get("content") });
      if (!parsed.success) return data({ error: firstZodError(parsed.error) }, { status: 422 });
      if (intent === "add") {
        await addSubmission(db, ctx.kukai, auth.user.id, parsed.data.content);
      } else {
        await updateSubmission(
          db,
          ctx.kukai,
          String(form.get("id")),
          auth.user.id,
          parsed.data.content,
        );
      }
      return data({ ok: "保存しました" });
    }
    if (intent === "delete") {
      await deleteSubmission(db, ctx.kukai, String(form.get("id")), auth.user.id);
      return data({ ok: "削除しました" });
    }
    return data({ error: "不明な操作です" }, { status: 400 });
  } catch (e) {
    if (e instanceof KukaiError) return data({ error: e.message }, { status: 409 });
    throw e;
  }
}

export default function Submit({ loaderData, actionData }: Route.ComponentProps) {
  const { kukaiId, name, theme, phase, limit, mine } = loaderData;
  const open = phase === "submission";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <p className="text-sm text-stone-500">
        <Link to={`/kukai/${kukaiId}`} className="underline">
          ← {name}
        </Link>
      </p>
      <h1 className="text-xl font-bold">投句</h1>
      {theme ? <p className="text-stone-600">兼題：{theme}</p> : null}

      {actionData && "ok" in actionData && actionData.ok ? (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{actionData.ok}</p>
      ) : null}
      {actionData && "error" in actionData && actionData.error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{actionData.error}</p>
      ) : null}

      {!open ? (
        <p className="rounded bg-stone-100 px-3 py-2 text-sm">
          いまは投句期間ではありません（現在：
          {KUKAI_PHASE_LABEL[phase as keyof typeof KUKAI_PHASE_LABEL] ?? phase}）。
        </p>
      ) : null}

      <ul className="space-y-3">
        {mine.map((s) => (
          <li key={s.id} className="rounded border border-stone-200 p-3">
            <Form method="post" className="flex items-end gap-2">
              <input type="hidden" name="intent" value="edit" />
              <input type="hidden" name="id" value={s.id} />
              <input
                name="content"
                defaultValue={s.content}
                maxLength={120}
                disabled={!open}
                className="flex-1 rounded border border-stone-300 px-3 py-2"
              />
              {open ? (
                <>
                  <button
                    type="submit"
                    className="rounded bg-stone-900 px-3 py-2 text-sm text-white hover:bg-stone-700"
                  >
                    更新
                  </button>
                </>
              ) : null}
            </Form>
            {open ? (
              <Form method="post" className="mt-1 text-right">
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="id" value={s.id} />
                <button type="submit" className="text-xs text-stone-500 underline">
                  削除
                </button>
              </Form>
            ) : null}
          </li>
        ))}
      </ul>

      {open && mine.length < limit ? (
        <Form method="post" className="flex items-end gap-2">
          <input type="hidden" name="intent" value="add" />
          <input
            name="content"
            required
            maxLength={120}
            placeholder="一句"
            className="flex-1 rounded border border-stone-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded bg-stone-900 px-4 py-2 text-white hover:bg-stone-700"
          >
            投句
          </button>
        </Form>
      ) : open ? (
        <p className="text-sm text-stone-500">投句上限（{limit} 句）に達しています。</p>
      ) : null}
    </div>
  );
}
