import { useEffect, useRef } from "react";
import { KUKAI_PHASE_LABEL, KUKAI_PHASES, phaseIndex } from "~/lib/constants";

/** 句会のフェーズは順序を持つ。通過済み＝藍塗り、現在＝リング、未来＝中空。 */
export function PhaseTrack({ phase }: { phase: string }) {
  const cur = phaseIndex(phase);
  const curRef = useRef<HTMLLIElement>(null);

  // 横スクロールする狭い画面では現在フェーズが画面外に出るので、中央へ寄せる。
  // biome-ignore lint/correctness/useExhaustiveDependencies: cur の変化で寄せ直す
  useEffect(() => {
    curRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [cur]);

  return (
    <ol className="flex items-start gap-0 overflow-x-auto pb-1">
      {KUKAI_PHASES.map((p, i) => {
        const state = i < cur ? "past" : i === cur ? "current" : "future";
        return (
          <li
            key={p}
            ref={i === cur ? curRef : undefined}
            className="flex min-w-[4.25rem] flex-col items-center"
          >
            <div className="flex w-full items-center">
              <span
                className={`h-px flex-1 ${i === 0 ? "opacity-0" : i <= cur ? "bg-ai" : "bg-rule"}`}
              />
              <span
                className={
                  state === "past"
                    ? "size-2 rounded-full bg-ai"
                    : state === "current"
                      ? "size-2.5 rounded-full border-2 border-ai bg-washi"
                      : "size-2 rounded-full border border-rule bg-washi"
                }
              />
              <span
                className={`h-px flex-1 ${
                  i === KUKAI_PHASES.length - 1 ? "opacity-0" : i < cur ? "bg-ai" : "bg-rule"
                }`}
              />
            </div>
            <span
              className={`mt-1 whitespace-nowrap px-1 text-center text-2xs leading-tight ${
                state === "current" ? "font-medium text-sumi" : "text-sumi-soft"
              }`}
            >
              {KUKAI_PHASE_LABEL[p]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
