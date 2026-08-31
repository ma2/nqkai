import { data, Form, Link } from "react-router";
import { PhaseTrack } from "~/components/PhaseTrack";
import { ActionNote, Note, PageTitle, Panel, SectionLabel } from "~/components/ui";
import { useKukaiStatePolling } from "~/hooks/useKukaiStatePolling";
import { isAtOrAfter, KUKAI_PHASE_LABEL, KUKAI_PHASES, phaseIndex } from "~/lib/constants";
import { getAuth, requireAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { assertTrustedRequest } from "~/server/http.server";
import {
  assertManage,
  extendSchedule,
  KukaiError,
  loadKukaiContext,
  revealAuthors,
  setKukaiDeleted,
  transitionPhase,
} from "~/server/kukai.server";
import {
  listMySubmissions,
  listSubmissionsForOrganizer,
  setSubmissionHidden,
} from "~/server/submissions.server";
import type { Route } from "./+types/kukai.$kukaiId";

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: loaderData ? `${loaderData.k.name} — nQkai` : "句会 — nQkai" },
];

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

  const mySubmissions = auth ? await listMySubmissions(db, k.id, auth.user.id) : [];
  const organizerSubmissions = ctx.canManage ? await listSubmissionsForOrganizer(db, k.id) : [];

  return {
    k: {
      id: k.id,
      name: k.name,
      theme: k.theme,
      description: k.description,
      phase: k.phase,
      visibility: k.visibility,
      authorsRevealed: k.authorsRevealedAt != null,
      deleted: k.deletedAt != null,
      org: { id: ctx.organization.id, name: ctx.organization.name },
      submissionsPerUser: k.submissionsPerUser,
      counts: { special: k.specialCount, regular: k.regularCount, reverse: k.reverseCount },
    },
    canManage: ctx.canManage,
    canManageDeletion: ctx.canManageDeletion,
    canParticipate: ctx.canParticipate,
    myCount: mySubmissions.length,
    organizerSubmissions,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  assertTrustedRequest(request);
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const ctx = await loadKukaiContext(db, params.kukaiId, auth.user.id, auth.user.isSystemAdmin);
  const k = ctx.kukai;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  try {
    switch (intent) {
      case "advance":
      case "rewind":
        assertManage(ctx);
        await transitionPhase(db, k, intent, auth.user.id);
        return data({ ok: "フェーズを更新しました" });
      case "revealAuthors":
        assertManage(ctx);
        await revealAuthors(db, k, auth.user.id);
        return data({ ok: "作者を公開しました" });
      case "extend": {
        assertManage(ctx);
        const field = String(form.get("field")) as Parameters<typeof extendSchedule>[2];
        const raw = String(form.get("value") ?? "").trim();
        await extendSchedule(db, k, field, raw ? new Date(raw) : null, auth.user.id);
        return data({ ok: "予定時刻を更新しました" });
      }
      case "hideSubmission":
      case "unhideSubmission":
        assertManage(ctx);
        await setSubmissionHidden(
          db,
          k.id,
          String(form.get("submissionId")),
          intent === "hideSubmission",
          auth.user.id,
          String(form.get("reason") ?? "") || null,
        );
        return data({
          ok: intent === "hideSubmission" ? "句を非表示にしました" : "句を再表示しました",
        });
      case "delete":
        if (!ctx.canManageDeletion) throw new Response(null, { status: 403 });
        await setKukaiDeleted(db, k, true, auth.user.id);
        return data({ ok: "句会を削除しました（復活できます）" });
      case "restore":
        if (!ctx.canManageDeletion) throw new Response(null, { status: 403 });
        await setKukaiDeleted(db, k, false, auth.user.id);
        return data({ ok: "句会を復活しました" });
      default:
        return data({ error: "不明な操作です" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof KukaiError) return data({ error: e.message }, { status: 409 });
    throw e;
  }
}

export default function KukaiTop({ loaderData, actionData }: Route.ComponentProps) {
  const { k, canManage, canManageDeletion, canParticipate, myCount, organizerSubmissions } =
    loaderData;
  useKukaiStatePolling(k.id);

  const pi = phaseIndex(k.phase);
  const prevPhase = pi > 0 ? KUKAI_PHASES[pi - 1] : null;
  const nextPhase = pi < KUKAI_PHASES.length - 1 ? KUKAI_PHASES[pi + 1] : null;
  const canSubmit = canParticipate && k.phase === "submission";
  const canSelect = canParticipate && k.phase === "selection";
  const showResults = isAtOrAfter(k.phase, "result");

  return (
    <div className="space-y-8">
      {k.deleted ? (
        <Note tone="error">この句会は削除されています（管理者は復活できます）。</Note>
      ) : null}

      <div className="space-y-3">
        <p className="text-xs text-sumi-soft">
          <Link to={`/orgs/${k.org.id}`} className="hover:text-ai">
            {k.org.name}
          </Link>
        </p>
        <PageTitle>{k.name}</PageTitle>
        {k.theme ? (
          <p className="u-data">
            兼題 <span className="text-sm text-sumi">{k.theme}</span>
          </p>
        ) : null}
      </div>

      <div className="border-y border-rule py-3">
        <PhaseTrack phase={k.phase} />
      </div>

      {k.description ? <p className="whitespace-pre-wrap text-sumi">{k.description}</p> : null}

      <ActionNote data={actionData} />

      {/* 参加者の導線 */}
      <div className="flex flex-wrap gap-3">
        {canSubmit ? (
          <Link
            to={`/kukai/${k.id}/submit`}
            className="rounded bg-ai px-4 py-2 text-sm text-washi hover:bg-ai-deep"
          >
            投句する（{myCount}/{k.submissionsPerUser}）
          </Link>
        ) : null}
        {canSelect ? (
          <Link
            to={`/kukai/${k.id}/select`}
            className="rounded bg-ai px-4 py-2 text-sm text-washi hover:bg-ai-deep"
          >
            選句する
          </Link>
        ) : null}
        {showResults ? (
          <Link
            to={`/kukai/${k.id}/results`}
            className="rounded border border-rule px-4 py-2 text-sm hover:bg-washi-edge"
          >
            結果・講評
          </Link>
        ) : null}
      </div>

      {/* 主催者パネル */}
      {canManage ? (
        <Panel as="section" className="space-y-4">
          <SectionLabel>主催者メニュー</SectionLabel>

          <div className="flex flex-wrap items-center gap-2">
            <Form method="post">
              <input type="hidden" name="intent" value="rewind" />
              <button
                type="submit"
                disabled={!prevPhase}
                className="rounded border border-rule px-3 py-1.5 text-sm hover:bg-washi-edge disabled:opacity-40"
              >
                {prevPhase ? `← ${KUKAI_PHASE_LABEL[prevPhase]} に戻す` : "← 前のフェーズ"}
              </button>
            </Form>
            <span className="text-sm text-sumi-soft">
              現在：{KUKAI_PHASE_LABEL[k.phase as keyof typeof KUKAI_PHASE_LABEL]}
            </span>
            <Form method="post">
              <input type="hidden" name="intent" value="advance" />
              <button
                type="submit"
                disabled={!nextPhase}
                className="rounded bg-ai px-3 py-1.5 text-sm text-washi hover:bg-ai-deep disabled:opacity-40"
              >
                {nextPhase ? `${KUKAI_PHASE_LABEL[nextPhase]} に進める →` : "次のフェーズ →"}
              </button>
            </Form>
          </div>

          {showResults && !k.authorsRevealed ? (
            <Form method="post">
              <input type="hidden" name="intent" value="revealAuthors" />
              <button
                type="submit"
                className="rounded border border-rule px-3 py-1.5 text-sm hover:bg-washi-edge"
              >
                作者を公開する
              </button>
            </Form>
          ) : null}

          {/* 投句の管理（既定は折りたたみ） */}
          {organizerSubmissions.length > 0 ? (
            <details className="space-y-2">
              <summary className="cursor-pointer text-sm font-medium text-sumi-soft">
                投句を確認・管理（{organizerSubmissions.length}）
              </summary>
              <ul className="mt-2 divide-y divide-rule rounded border border-rule">
                {organizerSubmissions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div className={s.isHidden ? "text-sumi-soft line-through" : ""}>
                      {s.content}
                      <span className="ml-2 text-sumi-soft">{s.authorHaigo ?? "?"}</span>
                    </div>
                    <Form method="post">
                      <input
                        type="hidden"
                        name="intent"
                        value={s.isHidden ? "unhideSubmission" : "hideSubmission"}
                      />
                      <input type="hidden" name="submissionId" value={s.id} />
                      <button type="submit" className="shrink-0 text-sumi-soft underline">
                        {s.isHidden ? "再表示" : "非表示"}
                      </button>
                    </Form>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {canManageDeletion ? (
            <Form
              method="post"
              onSubmit={(e) => {
                if (!k.deleted && !confirm("句会を削除します（復活可能）。よろしいですか？")) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value={k.deleted ? "restore" : "delete"} />
              <button
                type="submit"
                className={`text-sm underline ${k.deleted ? "text-sumi" : "text-red-600"}`}
              >
                {k.deleted ? "句会を復活する" : "句会を削除する"}
              </button>
            </Form>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
