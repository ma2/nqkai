import { data, Form, Link, redirect } from "react-router";
import { TanzakuItem, TanzakuList } from "~/components/Tanzaku";
import { ActionNote, Note, PageTitle } from "~/components/ui";
import { KUKAI_PHASE_LABEL, SELECTION_KIND_LABEL, type SelectionKind } from "~/lib/constants";
import { commentSchema, selectionSchema } from "~/lib/schemas";
import { getAuth, getGuestAuth } from "~/server/auth.server";
import { addComment, deleteOwnComment, listComments } from "~/server/comments.server";
import { getServerContext } from "~/server/context.server";
import { assertTrustedRequest, firstZodError } from "~/server/http.server";
import { actorFrom, canAct, KukaiError, loadKukaiContext } from "~/server/kukai.server";
import { clearSelection, listMySelections, setSelection } from "~/server/selections.server";
import { getSelectionSheet } from "~/server/submissions.server";
import type { Route } from "./+types/kukai.$kukaiId.select";

export const meta: Route.MetaFunction = () => [{ title: "選句 — nQkai" }];

const KINDS: SelectionKind[] = ["special", "regular", "reverse"];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await getAuth(db, request);
  const guestAuth = auth ? null : await getGuestAuth(db, request);
  if (!auth && !guestAuth) {
    const to = new URL(request.url).pathname;
    throw redirect(`/login?next=${encodeURIComponent(to)}`);
  }
  const ctx = await loadKukaiContext(
    db,
    params.kukaiId,
    auth?.user.id ?? null,
    auth?.user.isSystemAdmin ?? false,
    guestAuth?.sessionId ?? null,
  );
  const actor = actorFrom(auth?.user.id ?? null, ctx);
  if (!actor || !canAct(ctx, "select")) {
    throw new Response("この句会には参加できません", { status: 403 });
  }
  const k = ctx.kukai;
  const canComment = canAct(ctx, "comment");

  if (k.phase !== "selection") {
    return { open: false as const, kukaiId: k.id, name: k.name, phase: k.phase };
  }

  const [sheet, mySelections, comments] = await Promise.all([
    getSelectionSheet(db, k.id, actor),
    listMySelections(db, k.id, actor),
    listComments(db, k, actor),
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
    canComment,
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
  if (!actor || !canAct(ctx, "select")) throw new Response(null, { status: 403 });

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
        await setSelection(db, ctx.kukai, actor, parsed.data.submissionId, parsed.data.kind);
        return data({ ok: "選句を保存しました" });
      }
      case "clear":
        await clearSelection(db, ctx.kukai, actor, String(form.get("submissionId")));
        return data({ ok: "選句を取り消しました" });
      case "comment": {
        if (!canAct(ctx, "comment")) throw new Response(null, { status: 403 });
        const parsed = commentSchema.safeParse({
          submissionId: form.get("submissionId"),
          body: form.get("body"),
        });
        if (!parsed.success) return data({ error: firstZodError(parsed.error) }, { status: 422 });
        await addComment(db, ctx.kukai, actor, parsed.data.submissionId, parsed.data.body);
        return data({ ok: "コメントを投稿しました" });
      }
      case "deleteComment":
        if (!canAct(ctx, "comment")) throw new Response(null, { status: 403 });
        await deleteOwnComment(db, ctx.kukai, actor, String(form.get("commentId")));
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
        <p className="text-xs text-sumi-soft">
          <Link to={`/kukai/${loaderData.kukaiId}`} className="hover:text-ai">
            ← {loaderData.name}
          </Link>
        </p>
        <Note tone="error">
          いまは選句期間ではありません（現在
          {KUKAI_PHASE_LABEL[loaderData.phase as keyof typeof KUKAI_PHASE_LABEL] ??
            loaderData.phase}
          ）。
        </Note>
      </div>
    );
  }

  const { kukaiId, name, theme, limits, used, sheet, mySelections, comments, canComment } =
    loaderData;

  return (
    <div className="space-y-6">
      <p className="text-xs text-sumi-soft">
        <Link to={`/kukai/${kukaiId}`} className="hover:text-ai">
          ← {name}
        </Link>
      </p>
      <PageTitle>選句</PageTitle>

      <p className="flex flex-wrap gap-x-5 gap-y-1 border-y border-rule py-2 u-data">
        {theme ? (
          <span>
            兼題 <span className="text-sm text-sumi">{theme}</span>
          </span>
        ) : null}
        {KINDS.map((ki) => (
          <span key={ki}>
            {SELECTION_KIND_LABEL[ki]}{" "}
            <span className={used[ki] > limits[ki] ? "text-shu" : "text-sumi"}>
              {used[ki]}/{limits[ki]}
            </span>
          </span>
        ))}
      </p>

      <ActionNote data={actionData} />

      {sheet.length === 0 ? (
        <p className="text-sm text-sumi-soft">選句できる句がありません。</p>
      ) : (
        <TanzakuList>
          {sheet.map((s) => {
            const chosen = mySelections[s.id];
            const myComments = comments[s.id] ?? [];
            return (
              <TanzakuItem key={s.id} content={s.content} sealed={chosen === "special"} sealAnimate>
                <div className="flex flex-wrap items-center gap-1.5">
                  {KINDS.map((ki) => (
                    <Form method="post" key={ki}>
                      <input type="hidden" name="intent" value="select" />
                      <input type="hidden" name="submissionId" value={s.id} />
                      <input type="hidden" name="kind" value={ki} />
                      <button
                        type="submit"
                        className={`rounded-[3px] border px-3 py-1 text-sm ${
                          chosen === ki
                            ? "border-ai bg-ai text-washi"
                            : "border-rule text-sumi hover:bg-washi-edge"
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
                      <button
                        type="submit"
                        className="px-1.5 py-1 text-xs text-sumi-soft hover:text-shu"
                      >
                        取消
                      </button>
                    </Form>
                  ) : null}
                </div>

                {canComment ? (
                  <div className="mt-2 space-y-1">
                    {myComments.map((c) => (
                      <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
                        <p className="whitespace-pre-wrap text-sumi">{c.body}</p>
                        <Form method="post">
                          <input type="hidden" name="intent" value="deleteComment" />
                          <input type="hidden" name="commentId" value={c.id} />
                          <button
                            type="submit"
                            className="shrink-0 text-xs text-sumi-soft hover:text-shu"
                          >
                            削除
                          </button>
                        </Form>
                      </div>
                    ))}
                    <Form method="post" className="flex items-center gap-2">
                      <input type="hidden" name="intent" value="comment" />
                      <input type="hidden" name="submissionId" value={s.id} />
                      <input
                        name="body"
                        required
                        maxLength={1000}
                        placeholder="自分だけのメモ（選句中は他の人に見えません）"
                        className="min-w-0 flex-1 rounded-[3px] border border-rule bg-transparent px-2 py-1 text-sm outline-none focus:border-ai"
                      />
                      <button
                        type="submit"
                        className="shrink-0 rounded-[3px] border border-rule px-2.5 py-1 text-xs text-sumi-soft hover:bg-washi-edge"
                      >
                        書き留める
                      </button>
                    </Form>
                  </div>
                ) : null}
              </TanzakuItem>
            );
          })}
        </TanzakuList>
      )}
    </div>
  );
}
