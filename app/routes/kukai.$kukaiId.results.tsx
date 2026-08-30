import { data, Form, Link, redirect } from "react-router";
import {
  isAtOrAfter,
  KUKAI_PHASE_LABEL,
  SELECTION_KIND_LABEL,
  type SelectionKind,
} from "~/lib/constants";
import { commentSchema } from "~/lib/schemas";
import { getAuth, requireAuth } from "~/server/auth.server";
import { addComment, listComments } from "~/server/comments.server";
import { getServerContext } from "~/server/context.server";
import { assertTrustedRequest, firstZodError } from "~/server/http.server";
import { KukaiError, loadKukaiContext } from "~/server/kukai.server";
import { computeResults } from "~/server/results.server";
import type { Route } from "./+types/kukai.$kukaiId.results";

export const meta: Route.MetaFunction = () => [{ title: "結果 — nQkai" }];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await getAuth(db, request);
  const ctx = await loadKukaiContext(
    db,
    params.kukaiId,
    auth?.user.id ?? null,
    auth?.user.isSystemAdmin ?? false,
  );
  const k = ctx.kukai;
  if (!isAtOrAfter(k.phase, "result")) throw redirect(`/kukai/${k.id}`);

  const [rows, comments] = await Promise.all([
    computeResults(db, k),
    listComments(db, k, auth?.user.id ?? null),
  ]);

  return {
    kukaiId: k.id,
    name: k.name,
    theme: k.theme,
    phase: k.phase,
    authorsRevealed: k.authorsRevealedAt != null,
    canComment: ctx.canParticipate && k.phase === "commenting",
    rows,
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
  const parsed = commentSchema.safeParse({
    submissionId: form.get("submissionId"),
    body: form.get("body"),
  });
  if (!parsed.success) return data({ error: firstZodError(parsed.error) }, { status: 422 });

  try {
    await addComment(db, ctx.kukai, auth.user.id, parsed.data.submissionId, parsed.data.body);
    return data({ ok: "コメントを投稿しました" });
  } catch (e) {
    if (e instanceof KukaiError) return data({ error: e.message }, { status: 409 });
    throw e;
  }
}

export default function Results({ loaderData, actionData }: Route.ComponentProps) {
  const { kukaiId, name, theme, phase, authorsRevealed, canComment, rows, comments } = loaderData;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="text-sm text-stone-500">
        <Link to={`/kukai/${kukaiId}`} className="underline">
          ← {name}
        </Link>
      </p>
      <div>
        <h1 className="text-xl font-bold">結果・講評</h1>
        <p className="mt-1 text-sm text-stone-500">
          {KUKAI_PHASE_LABEL[phase as keyof typeof KUKAI_PHASE_LABEL] ?? phase}
          {authorsRevealed ? "・作者公開済み" : "・作者は未公開"}
        </p>
        {theme ? <p className="text-stone-600">兼題：{theme}</p> : null}
      </div>

      {actionData && "ok" in actionData && actionData.ok ? (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{actionData.ok}</p>
      ) : null}
      {actionData && "error" in actionData && actionData.error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{actionData.error}</p>
      ) : null}

      <ol className="space-y-4">
        {rows.map((r) => {
          const cs = comments[r.submissionId] ?? [];
          return (
            <li key={r.submissionId} className="rounded border border-stone-200 bg-white p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-stone-500">
                  第{r.rank}位・{r.score}点
                </span>
                {r.authorHaigo ? (
                  <span className="text-sm text-stone-600">作者：{r.authorHaigo}</span>
                ) : null}
              </div>
              <p className="tategaki mx-auto my-2 max-h-48 text-lg">{r.content}</p>
              <p className="text-sm text-stone-500">
                {(["special", "regular", "reverse"] as SelectionKind[])
                  .filter((ki) => r.counts[ki] > 0)
                  .map((ki) => `${SELECTION_KIND_LABEL[ki]} ${r.counts[ki]}`)
                  .join("・") || "選なし"}
              </p>
              {r.selectors.length > 0 ? (
                <p className="mt-1 text-xs text-stone-400">
                  {r.selectors
                    .map((s) => `${s.haigo ?? "?"}（${SELECTION_KIND_LABEL[s.kind]}）`)
                    .join("、")}
                </p>
              ) : null}

              {cs.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-stone-100 pt-2 text-sm">
                  {cs.map((c) => (
                    <li key={c.id}>
                      <span className="text-stone-400">{c.haigo ?? "?"}：</span>
                      <span className="whitespace-pre-wrap text-stone-700">{c.body}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {canComment ? (
                <Form method="post" className="mt-2 flex items-end gap-2">
                  <input type="hidden" name="submissionId" value={r.submissionId} />
                  <input
                    name="body"
                    required
                    maxLength={1000}
                    placeholder="講評コメント"
                    className="flex-1 rounded border border-stone-300 px-2 py-1 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded border border-stone-300 px-2 py-1 text-sm hover:bg-stone-100"
                  >
                    投稿
                  </button>
                </Form>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
