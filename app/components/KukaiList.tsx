import { Link } from "react-router";
import { KUKAI_PHASE_LABEL, type KukaiPhase } from "~/lib/constants";

export interface KukaiListItem {
  id: string;
  name: string;
  phase: string;
  orgName: string;
}

/** 句会の一覧（ダッシュボードと句会一覧ページで共用）。 */
export function KukaiList({ items, empty }: { items: KukaiListItem[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-sumi-soft">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-rule rounded border border-rule bg-transparent">
      {items.map((k) => (
        <li key={k.id} className="flex items-center justify-between px-4 py-2 text-sm">
          <Link to={`/kukai/${k.id}`} className="font-medium hover:underline">
            {k.name}
            <span className="ml-2 text-sumi-soft">{k.orgName}</span>
          </Link>
          <span className="text-sumi-soft">
            {KUKAI_PHASE_LABEL[k.phase as KukaiPhase] ?? k.phase}
          </span>
        </li>
      ))}
    </ul>
  );
}
