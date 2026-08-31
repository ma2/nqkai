import type { ReactNode } from "react";

/** ボタンのクラス（藍＝主操作、地＝副操作） */
export const btnPrimary =
  "inline-flex items-center justify-center rounded-[3px] bg-ai px-4 py-2 text-sm text-washi hover:bg-ai-deep disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center rounded-[3px] border border-rule px-4 py-2 text-sm text-sumi hover:bg-washi-edge disabled:opacity-40";
export const btnSmall =
  "inline-flex items-center justify-center rounded-[3px] border border-rule px-2.5 py-1 text-xs text-sumi-soft hover:bg-washi-edge";
export const inputBase =
  "mt-1 w-full rounded-[3px] border border-rule bg-transparent px-3 py-2 text-sumi outline-none focus:border-ai";
export const fieldLabel = "block";
export const fieldLabelText = "text-xs text-sumi-soft";

/** 影・塗りなし。ヘアラインと余白で面を定義する。 */
export function Panel({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  return <Tag className={`rounded-[3px] border border-rule p-4 ${className}`}>{children}</Tag>;
}

/** 朱の角 ＋ 和文ラベル。段落見出しに使う。 */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between">
      <h2 className="flex items-center gap-2 text-sm tracking-[0.06em] text-sumi-soft">
        <span aria-hidden className="size-[6px] bg-shu" />
        {children}
      </h2>
      {action ? <div className="text-xs">{action}</div> : null}
    </div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="font-mincho text-2xl font-medium tracking-wide">{children}</h1>;
}

/** 成否の通知。飴色を避け、界線一本で示す。 */
export function Note({ tone, children }: { tone: "ok" | "error"; children: ReactNode }) {
  const border = tone === "ok" ? "border-ai" : "border-shu";
  const text = tone === "ok" ? "text-sumi" : "text-shu";
  return (
    <p className={`border-l-2 ${border} bg-washi-edge px-3 py-2 text-sm ${text}`}>{children}</p>
  );
}

/** actionData から ok / error を拾って Note を出す共通表示 */
export function ActionNote({
  data,
}: {
  data: { ok?: unknown; error?: unknown } | null | undefined;
}) {
  if (data && "ok" in data && data.ok) return <Note tone="ok">{String(data.ok)}</Note>;
  if (data && "error" in data && data.error) {
    return <Note tone="error">{String(data.error)}</Note>;
  }
  return null;
}
