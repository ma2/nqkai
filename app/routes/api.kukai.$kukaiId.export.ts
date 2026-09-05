import { isAtOrAfter } from "~/lib/constants";
import { formatKukaiCsv, formatKukaiText, ymd } from "~/lib/export";
import { requireAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { buildKukaiExport } from "~/server/export.server";
import { loadKukaiContext } from "~/server/kukai.server";
import type { Route } from "./+types/api.kukai.$kukaiId.export";

/** 句会エクスポート。主催者・結社管理者・副管理者、`result` 以降のみ。 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await requireAuth(db, request);
  const ctx = await loadKukaiContext(db, params.kukaiId, auth.user.id, auth.user.isSystemAdmin);
  if (!ctx.canManageDeletion) {
    throw new Response("エクスポートの権限がありません", { status: 403 });
  }
  if (!isAtOrAfter(ctx.kukai.phase, "result")) {
    throw new Response("結果発表以降でのみエクスポートできます", { status: 409 });
  }

  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "text";
  const data = await buildKukaiExport(db, ctx.kukai, auth.user.id);

  const stamp = ymd(data.exportedAt);
  if (format === "csv") {
    return new Response(formatKukaiCsv(data), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="kukai-${params.kukaiId}-${stamp}.csv"`,
        "cache-control": "no-store",
      },
    });
  }
  return new Response(formatKukaiText(data), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="kukai-${params.kukaiId}-${stamp}.txt"`,
      "cache-control": "no-store",
    },
  });
}
