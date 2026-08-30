import type { ReactNode } from "react";
import { Seal } from "./Logo";

/**
 * 短冊：句を縦組みで載せる細長い紙。特選（sealed）のとき隅に朱の落款を押す。
 * 選のボタンやコメントは呼び出し側で短冊の脇に置く。
 */
export function Tanzaku({
  content,
  sealed = false,
  sealAnimate = false,
}: {
  content: string;
  sealed?: boolean;
  sealAnimate?: boolean;
}) {
  return (
    <div className="relative w-[3.25rem] shrink-0 self-start border-x border-rule bg-washi-edge/50 px-1.5 py-3">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-2 right-[3px] w-px bg-rule"
      />
      <p className="tategaki mx-auto min-h-[8rem] text-[1.2rem] text-sumi">{content}</p>
      {sealed ? (
        <span className="absolute bottom-1 left-1">
          <Seal size={20} animate={sealAnimate} />
        </span>
      ) : null}
    </div>
  );
}

/**
 * 短冊を縦に積んだ一覧（清記用紙のイメージ）。1件＝短冊＋脇の操作。
 * 一覧性を優先し、横スクロールはしない。
 */
export function TanzakuList({ children }: { children: ReactNode }) {
  return <ul className="space-y-3">{children}</ul>;
}

/** 一覧の1件。短冊を左、操作を右（狭い画面では縦積み）。 */
export function TanzakuItem({
  content,
  sealed = false,
  sealAnimate = false,
  lead,
  children,
}: {
  content: string;
  sealed?: boolean;
  sealAnimate?: boolean;
  /** 短冊の手前に置く（順位など） */
  lead?: ReactNode;
  /** 短冊の脇（選のボタン・コメントなど） */
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-[3px] border border-rule p-3 sm:flex-row sm:items-start">
      <div className="flex shrink-0 items-start gap-2">
        {lead}
        <Tanzaku content={content} sealed={sealed} sealAnimate={sealAnimate} />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
