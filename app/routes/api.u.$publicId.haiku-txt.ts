import { formatPersonalHaikuText } from "~/lib/export";
import { getAuth } from "~/server/auth.server";
import { getServerContext } from "~/server/context.server";
import { listPublicHaiku } from "~/server/haiku.server";
import type { Route } from "./+types/api.u.$publicId.haiku-txt";

/** 個人俳句のテキスト書き出し。本人のみ（公開ページは HTML で誰でも閲覧可）。 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const auth = await getAuth(db, request);
  if (!auth || auth.user.publicId !== params.publicId) {
    throw new Response("本人のみダウンロードできます", { status: 403 });
  }

  const haiku = await listPublicHaiku(db, params.publicId);
  if (!haiku) throw new Response(null, { status: 404 });

  const body = formatPersonalHaikuText(haiku.haigo, haiku.items);
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="haiku-${params.publicId}.txt"`,
      "cache-control": "no-store",
    },
  });
}
