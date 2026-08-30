import { data, Form, Link, redirect } from "react-router";
import { Tanzaku, TanzakuRow } from "~/components/Tanzaku";
import { ActionNote, PageTitle } from "~/components/ui";
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

      <ActionNote data={actionData} />

      <TanzakuRow>
        {rows.map((r) => {
          const cs = comments[r.submissionId] ?? [];
          return (
            <div key={r.submissionId} className="flex shrink-0 gap-3">
              <div className="flex flex-col items-center gap-1">
                <span className="font-mincho text-2xl leading-none text-sumi-soft">
                  {rankKanji(r.rank)}
                </span>
                <span className="rounded-[3px] bg-washi-edge px-1.5 py-0.5 u-data">
                  {r.score}点
                </span>
              </div>
              <Tanzaku content={r.content} sealed={r.counts.special > 0} />
              <div className="flex w-52 flex-col gap-1.5">
                <p className="u-data">
                  {(["special", "regular", "reverse"] as SelectionKind[])
                    .filter((ki) => r.counts[ki] > 0)
                    .map((ki) => `${SELECTION_KIND_LABEL[ki]} ${r.counts[ki]}`)
                    .join(" ・ ") || "選なし"}
                </p>
                {r.authorHaigo ? <p className="text-sm text-sumi">作者：{r.authorHaigo}</p> : null}
                {r.selectors.length > 0 ? (
                  <p className="text-2xs text-sumi-soft">
                    {r.selectors
                      .map((s) => `${s.haigo ?? "?"}（${SELECTION_KIND_LABEL[s.kind]}）`)
                      .join("、")}
                  </p>
                ) : null}

                {cs.length > 0 ? (
                  <ul className="space-y-1 border-t border-rule pt-1.5 text-xs">
                    {cs.map((c) => (
                      <li key={c.id}>
                        <span className="text-sumi-soft">{c.haigo ?? "?"}：</span>
                        <span className="whitespace-pre-wrap text-sumi">{c.body}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {canComment ? (
                  <Form method="post" className="space-y-1">
                    <input type="hidden" name="submissionId" value={r.submissionId} />
                    <input
                      name="body"
                      required
                      maxLength={1000}
                      placeholder="講評コメント"
                      className="w-full rounded-[3px] border border-rule bg-transparent px-2 py-1 text-xs outline-none focus:border-ai"
                    />
                    <button
                      type="submit"
                      className="rounded-[3px] border border-rule px-2 py-0.5 text-2xs text-sumi-soft hover:bg-washi-edge"
                    >
                      投稿
                    </button>
                  </Form>
                ) : null}
              </div>
            </div>
          );
        })}
      </TanzakuRow>
    </div>
  );
}

const KANJI = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
function rankKanji(n: number): string {
  return n >= 1 && n <= 10 ? KANJI[n]! : `${n}`;
}
