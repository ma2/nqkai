import { Link } from "react-router";
import { TanzakuItem, TanzakuList } from "~/components/Tanzaku";
import { PageTitle } from "~/components/ui";
import { ymd } from "~/lib/export";
import { getServerContext } from "~/server/context.server";
import { listPublicHaiku } from "~/server/haiku.server";
import type { Route } from "./+types/u.$publicId";

export function meta({ loaderData }: Route.MetaArgs) {
  const haigo = loaderData?.haigo;
  return [{ title: haigo ? `${haigo} の句 — nQkai` : "句集 — nQkai" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const { db } = getServerContext(context);
  const haiku = await listPublicHaiku(db, params.publicId);
  if (!haiku) throw new Response("ページが見つかりません", { status: 404 });
  return {
    haigo: haiku.haigo,
    publicId: haiku.publicId,
    items: haiku.items,
  };
}

export default function PublicHaiku({ loaderData }: Route.ComponentProps) {
  const { haigo, publicId, items } = loaderData;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-rule pb-3">
        <PageTitle>{haigo} の句</PageTitle>
        <span className="u-data">全 {items.length} 句</span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-sumi-soft">公開されている句はまだありません。</p>
      ) : (
        <TanzakuList>
          {items.map((it) => (
            <TanzakuItem key={it.id} content={it.content}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-sumi-soft">句会</dt>
                <dd>{it.kukaiName}</dd>
                {it.theme ? (
                  <>
                    <dt className="text-sumi-soft">兼題</dt>
                    <dd>{it.theme}</dd>
                  </>
                ) : null}
                <dt className="text-sumi-soft">日付</dt>
                <dd className="u-data">{ymd(new Date(it.date))}</dd>
                <dt className="text-sumi-soft">得点</dt>
                <dd className="u-data">{it.score}点</dd>
              </dl>
            </TanzakuItem>
          ))}
        </TanzakuList>
      )}

      <p className="border-t border-rule pt-4 text-xs text-sumi-soft">
        <Link to={`/api/u/${publicId}/haiku.txt`} reloadDocument className="hover:text-ai">
          テキストで書き出す
        </Link>
        <span className="ml-2">（本人のみ）</span>
      </p>
    </div>
  );
}
