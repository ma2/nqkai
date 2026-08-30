import { useEffect, useRef } from "react";
import { useFetcher, useRevalidator } from "react-router";

interface KukaiState {
  phase: string;
  authorsRevealed: boolean;
  updatedAt: number;
  submissionCount: number;
  serverTime: number;
}

/**
 * 句会画面を開いている間、`/api/kukai/:id/state` を約15秒間隔で取得し、
 * `phase` / `authorsRevealed` / `submissionCount` が変化したら loader を再検証する。
 * タブが非アクティブの間は止める。
 */
export function useKukaiStatePolling(kukaiId: string, intervalMs = 15_000) {
  const fetcher = useFetcher<KukaiState>();
  const revalidator = useRevalidator();
  const last = useRef<string | null>(null);
  const load = fetcher.load;

  useEffect(() => {
    const url = `/api/kukai/${kukaiId}/state`;
    const tick = () => {
      if (document.visibilityState === "visible") load(url);
    };
    const timer = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [kukaiId, intervalMs, load]);

  useEffect(() => {
    const s = fetcher.data;
    if (!s) return;
    const sig = `${s.phase}|${s.authorsRevealed}|${s.submissionCount}`;
    if (last.current === null) {
      last.current = sig;
      return;
    }
    if (sig !== last.current) {
      last.current = sig;
      revalidator.revalidate();
    }
  }, [fetcher.data, revalidator]);
}
