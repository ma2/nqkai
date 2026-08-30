import { data, Form, Link } from "react-router";
import { KUKAI_PHASE_LABEL, SELECTION_KIND_LABEL, type SelectionKind } from "~/lib/constants";
import { commentSchema, selectionSchema } from "~/lib/schemas";
import { requireAuth } from "~/server/auth.server";
import { addComment, deleteOwnComment, listComments } from "~/server/comments.server";
import { getServerContext } from "~/server/context.server";
import { assertTrustedRequest, firstZodError } from "~/server/http.server";
import { KukaiError, loadKukaiContext } from "~/server/kukai.server";
import { clearSelection, listMySelections, setSelection } from "~/server/selections.server";
import { getSelectionSheet } from "~/server/submissions.server";
import type { Route } from "./+types/kukai.$kukaiId.select";

export const meta: Route.MetaFunction = () => [{ title: "選句 — nQkai" }];

const KINDS: SelectionKind[] = ["special", "regular", "reverse"];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const ctx = await loadKukaiContext(db, params.kukaiId, auth.user.id, auth.user.isSystemAdmin);
  if (!ctx.canParticipate) throw new Response("この句会には参加できません", { status: 403 });
  const k = ctx.kukai;

  if (k.phase !== "selection") {
    return { open: false as const, kukaiId: k.id, name: k.name, phase: k.phase };
  }

  const [sheet, mySelections, comments] = await Promise.all([
    getSelectionSheet(db, k.id, auth.user.id),
    listMySelections(db, k.id, auth.user.id),
    listComments(db, k, auth.user.id),
  ]);

  const used: Record<SelectionKind, number> = { special: 0, regular: 0, reverse: 0 };
  for (const ki of Object.values(mySelections)) used[ki]++;

  return {
    open: true as const,
    kukaiId: k.id,
    name: k.name,
    theme: k.theme,
    phase: k.phase,
    limits: { special: k.specialCount, regular: k.regularCount, reverse: k.reverseCount },
    used,
    sheet,
    mySelections,
    comments,
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
    switch (intent) {
      case "select": {
        const parsed = selectionSchema.safeParse({
          submissionId: form.get("submissionId"),
          kind: form.get("kind"),
        });
        if (!parsed.success) return data({ error: firstZodError(parsed.error) }, { status: 422 });
        await setSelection(db, ctx.kukai, auth.user.id, parsed.data.submissionId, parsed.data.kind);
        return data({ ok: "選句を保存しました" });
      }
      case "clear":
        await clearSelection(db, ctx.kukai, auth.user.id, String(form.get("submissionId")));
        return data({ ok: "選句を取り消しました" });
      case "comment": {
        const parsed = commentSchema.safeParse({
          submissionId: form.get("submissionId"),
          body: form.get("body"),
        });
        if (!parsed.success) return data({ error: firstZodError(parsed.error) }, { status: 422 });
        await addComment(db, ctx.kukai, auth.user.id, parsed.data.submissionId, parsed.data.body);
        return data({ ok: "コメントを投稿しました" });
      }
      case "deleteComment":
        await deleteOwnComment(db, ctx.kukai, auth.user.id, String(form.get("commentId")));
        return data({ ok: "コメントを削除しました" });
      default:
        return data({ error: "不明な操作です" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof KukaiError) return data({ error: e.message }, { status: 409 });
    throw e;
  }
}

export default function Select({ loaderData, actionData }: Route.ComponentProps) {
  if (!loaderData.open) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <p className="text-sm text-stone-500">
          <Link to={`/kukai/${loaderData.kukaiId}`} className="underline">
            ← {loaderData.name}
          </Link>
        </p>
        <p className="rounded bg-stone-100 px-3 py-2 text-sm">
          いまは選句期間ではありません（現在：
          {KUKAI_PHASE_LABEL[loaderData.phase as keyof typeof KUKAI_PHASE_LABEL] ??
            loaderData.phase}
          ）。
        </p>
      </div>
    );
  }

  const { kukaiId, name, theme, limits, used, sheet, mySelections, comments } = loaderData;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="text-sm text-stone-500">
        <Link to={`/kukai/${kukaiId}`} className="underline">
          ← {name}
        </Link>
      </p>
      <h1 className="text-xl font-bold">選句</h1>
      {theme ? <p className="text-stone-600">兼題：{theme}</p> : null}

      <p className="text-sm text-stone-600">
        {KINDS.map((ki) => (
          <span key={ki} className="mr-4">
            {SELECTION_KIND_LABEL[ki]} {used[ki]}/{limits[ki]}
          </span>
        ))}
      </p>

      {actionData && "ok" in actionData && actionData.ok ? (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{actionData.ok}</p>
      ) : null}
      {actionData && "error" in actionData && actionData.error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{actionData.error}</p>
      ) : null}

      {sheet.length === 0 ? (
        <p className="text-stone-500">選句できる句がありません。</p>
      ) : (
        <ul className="space-y-4">
          {sheet.map((s) => {
            const chosen = mySelections[s.id];
            const myComments = comments[s.id] ?? [];
            return (
              <li key={s.id} className="rounded border border-stone-200 bg-white p-4">
                <p className="tategaki mx-auto my-2 max-h-48 text-lg">{s.content}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {KINDS.map((ki) => (
                    <Form method="post" key={ki}>
                      <input type="hidden" name="intent" value="select" />
                      <input type="hidden" name="submissionId" value={s.id} />
                      <input type="hidden" name="kind" value={ki} />
                      <button
                        type="submit"
                        className={`rounded border px-3 py-1 text-sm ${
                          chosen === ki
                            ? "border-stone-900 bg-stone-900 text-white"
                            : "border-stone-300 hover:bg-stone-100"
                        }`}
                      >
                        {SELECTION_KIND_LABEL[ki]}
                      </button>
                    </Form>
                  ))}
                  {chosen ? (
                    <Form method="post">
                      <input type="hidden" name="intent" value="clear" />
                      <input type="hidden" name="submissionId" value={s.id} />
                      <button type="submit" className="px-2 py-1 text-sm text-stone-500 underline">
                        取消
                      </button>
                    </Form>
                  ) : null}
                </div>

                <div className="mt-3 space-y-1">
                  {myComments.map((c) => (
                    <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
                      <p className="whitespace-pre-wrap text-stone-700">{c.body}</p>
                      <Form method="post">
                        <input type="hidden" name="intent" value="deleteComment" />
                        <input type="hidden" name="commentId" value={c.id} />
                        <button type="submit" className="shrink-0 text-xs text-stone-400 underline">
                          削除
                        </button>
                      </Form>
                    </div>
                  ))}
                  <Form method="post" className="flex items-end gap-2">
                    <input type="hidden" name="intent" value="comment" />
                    <input type="hidden" name="submissionId" value={s.id} />
                    <input
                      name="body"
                      required
                      maxLength={1000}
                      placeholder="コメント（選句中は自分だけに見えます）"
                      className="flex-1 rounded border border-stone-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded border border-stone-300 px-2 py-1 text-sm hover:bg-stone-100"
                    >
                      投稿
                    </button>
                  </Form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
