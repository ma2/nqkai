import { data, Form, Link, redirect } from "react-router";
import { TanzakuItem, TanzakuList } from "~/components/Tanzaku";
import { ActionNote, PageTitle } from "~/components/ui";
import {
  isAtOrAfter,
  KUKAI_PHASE_LABEL,
  SELECTION_KIND_LABEL,
  type SelectionKind,
} from "~/lib/constants";
import { commentSchema } from "~/lib/schemas";
import { getAuth, getGuestAuth } from "~/server/auth.server";
import { addComment, listComments } from "~/server/comments.server";
import { getServerContext } from "~/server/context.server";
import { assertTrustedRequest, firstZodError } from "~/server/http.server";
import { actorFrom, canAct, KukaiError, loadKukaiContext } from "~/server/kukai.server";
import { computeResults } from "~/server/results.server";
import type { Route } from "./+types/kukai.$kukaiId.results";

export const meta: Route.MetaFunction = () => [{ title: "結果 — nQkai" }];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await getAuth(db, request);
  const guestAuth = auth ? null : await getGuestAuth(db, request);
  const ctx = await loadKukaiContext(
    db,
    params.kukaiId,
    auth?.user.id ?? null,
    auth?.user.isSystemAdmin ?? false,
    guestAuth?.sessionId ?? null,
  );
  const k = ctx.kukai;
  if (!isAtOrAfter(k.phase, "result")) throw redirect(`/kukai/${k.id}`);

  const actor = actorFrom(auth?.user.id ?? null, ctx);
  const [rows, comments] = await Promise.all([computeResults(db, k), listComments(db, k, actor)]);

  return {
    kukaiId: k.id,
    name: k.name,
    theme: k.theme,
    phase: k.phase,
    authorsRevealed: k.authorsRevealedAt != null,
    canComment: canAct(ctx, "comment") && k.phase === "commenting",
    canExport: ctx.canManageDeletion,
    rows,
    comments,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { db } = getServerContext(context);
  const auth = await getAuth(db, request);
  const guestAuth = auth ? null : await getGuestAuth(db, request);
  if (!auth && !guestAuth) throw new Response(null, { status: 401 });
  const ctx = await loadKukaiContext(
    db,
    params.kukaiId,
    auth?.user.id ?? null,
    auth?.user.isSystemAdmin ?? false,
    guestAuth?.sessionId ?? null,
  );
  const actor = actorFrom(auth?.user.id ?? null, ctx);
  if (!actor || !canAct(ctx, "comment")) throw new Response(null, { status: 403 });

  const form = await request.formData();
  const parsed = commentSchema.safeParse({
    submissionId: form.get("submissionId"),
    body: form.get("body"),
  });
  if (!parsed.success) return data({ error: firstZodError(parsed.error) }, { status: 422 });

  try {
    await addComment(db, ctx.kukai, actor, parsed.data.submissionId, parsed.data.body);
    return data({ ok: "コメントを投稿しました" });
  } catch (e) {
    if (e instanceof KukaiError) return data({ error: e.message }, { status: 409 });
    throw e;
  }
}

export default function Results({ loaderData, actionData }: Route.ComponentProps) {
  const { kukaiId, name, theme, phase, authorsRevealed, canComment, canExport, rows, comments } =
    loaderData;

  return (
    <div className="space-y-6">
      <p className="text-xs text-sumi-soft">
        <Link to={`/kukai/${kukaiId}`} className="hover:text-ai">
          ← {name}
        </Link>
      </p>
      <PageTitle>結果・講評</PageTitle>
      <p className="border-y border-rule py-2 u-data">
        {KUKAI_PHASE_LABEL[phase as keyof typeof KUKAI_PHASE_LABEL] ?? phase}
        {authorsRevealed ? " ・ 作者公開済み" : " ・ 作者は未公開"}
        {theme ? (
          <>
            {" ・ 兼題 "}
            <span className="text-sm text-sumi">{theme}</span>
          </>
        ) : null}
      </p>

      {canExport ? (
        <p className="flex gap-4 text-xs text-sumi-soft">
          <span>書き出し</span>
          <Link
            to={`/api/kukai/${kukaiId}/export?format=text`}
            reloadDocument
            className="hover:text-ai"
          >
            テキスト
          </Link>
          <Link
            to={`/api/kukai/${kukaiId}/export?format=csv`}
            reloadDocument
            className="hover:text-ai"
          >
            CSV
          </Link>
        </p>
      ) : null}

      <ActionNote data={actionData} />

      <TanzakuList>
        {rows.map((r) => {
          const cs = comments[r.submissionId] ?? [];
          return (
            <TanzakuItem
              key={r.submissionId}
              content={r.content}
              sealed={r.counts.special > 0}
              lead={
                <div className="flex flex-col items-center gap-1">
                  <span className="font-mincho text-2xl leading-none text-sumi-soft">
                    {rankKanji(r.rank)}
                  </span>
                  <span className="rounded-[3px] bg-washi-edge px-1.5 py-0.5 u-data">
                    {r.score}点
                  </span>
                </div>
              }
            >
              <p className="u-data">
                {(["special", "regular", "reverse"] as SelectionKind[])
                  .filter((ki) => r.counts[ki] > 0)
                  .map((ki) => `${SELECTION_KIND_LABEL[ki]} ${r.counts[ki]}`)
                  .join(" ・ ") || "選なし"}
              </p>
              {r.authorHaigo ? (
                <p className="mt-1 text-sm text-sumi">作者：{r.authorHaigo}</p>
              ) : null}
              {r.selectors.length > 0 ? (
                <p className="mt-1 text-xs text-sumi-soft">
                  {r.selectors
                    .map((s) => `${s.haigo ?? "?"}（${SELECTION_KIND_LABEL[s.kind]}）`)
                    .join("、")}
                </p>
              ) : null}

              {cs.length > 0 ? (
                <ul className="mt-2 space-y-1 border-t border-rule pt-2 text-sm">
                  {cs.map((c) => (
                    <li key={c.id}>
                      <span className="text-sumi-soft">{c.haigo ?? "?"}：</span>
                      <span className="whitespace-pre-wrap text-sumi">{c.body}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {canComment ? (
                <Form method="post" className="mt-2 flex items-center gap-2">
                  <input type="hidden" name="submissionId" value={r.submissionId} />
                  <input
                    name="body"
                    required
                    maxLength={1000}
                    placeholder="講評コメント"
                    className="min-w-0 flex-1 rounded-[3px] border border-rule bg-transparent px-2 py-1 text-sm outline-none focus:border-ai"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-[3px] border border-rule px-2.5 py-1 text-xs text-sumi-soft hover:bg-washi-edge"
                  >
                    投稿
                  </button>
                </Form>
              ) : null}
            </TanzakuItem>
          );
        })}
      </TanzakuList>
    </div>
  );
}

const KANJI = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
function rankKanji(n: number): string {
  return n >= 1 && n <= 10 ? KANJI[n]! : `${n}`;
}
