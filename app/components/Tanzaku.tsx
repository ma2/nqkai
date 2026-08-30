import type { ReactNode } from "react";
import { Seal } from "./Logo";

/**
 * 短冊：句を縦組みで載せる細長い紙。特選（sealed）のとき隅に朱の落款を押す。
 * 幅は狭い。選のボタンやコメントは呼び出し側で短冊の脇に置く。
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
    <div className="relative w-[3rem] shrink-0 border-x border-rule bg-washi-edge/50 px-1.5 py-3">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 right-[3px] w-px bg-rule"
      />
      <p className="tategaki mx-auto min-h-[9rem] max-h-[19rem] overflow-hidden text-[1.2rem] text-sumi">
        {content}
      </p>
      {sealed ? (
        <span className="absolute bottom-1 left-1">
          <Seal size={20} animate={sealAnimate} />
        </span>
      ) : null}
    </div>
  );
}

/** 短冊とその脇の操作を「吊るした列」に並べる。狭い画面は横スクロール（右→左）。 */
export function TanzakuRow({ children }: { children: ReactNode }) {
  return <div className="tanzaku-row -mx-1 px-1">{children}</div>;
}
