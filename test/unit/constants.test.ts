import { describe, expect, it } from "vitest";
import {
  isAtOrAfter,
  KUKAI_PHASE_LABEL,
  KUKAI_PHASES,
  NOTIFICATION_TYPES,
  ORG_ROLE_LABEL,
  ORG_ROLES,
  phaseIndex,
  SELECTION_KIND_LABEL,
} from "~/lib/constants";
import { NOTIFICATION_MESSAGES } from "~/lib/notifications";

describe("ラベルの網羅性", () => {
  it("すべての句会フェーズに表示ラベルがある", () => {
    for (const p of KUKAI_PHASES) {
      expect(KUKAI_PHASE_LABEL[p], p).toBeTruthy();
    }
    expect(Object.keys(KUKAI_PHASE_LABEL)).toHaveLength(KUKAI_PHASES.length);
  });

  it("すべての結社ロールに表示ラベルがある", () => {
    for (const r of ORG_ROLES) expect(ORG_ROLE_LABEL[r], r).toBeTruthy();
  });

  it("すべての通知種別に既定メッセージがある", () => {
    for (const t of NOTIFICATION_TYPES) {
      expect(NOTIFICATION_MESSAGES[t], t).toBeTruthy();
    }
  });

  it("選の種別ラベルは 3 種", () => {
    expect(Object.keys(SELECTION_KIND_LABEL)).toEqual(["special", "regular", "reverse"]);
  });
});

describe("フェーズ順序", () => {
  it("phaseIndex は 0..n-1 を隙間なく返す", () => {
    expect(KUKAI_PHASES.map(phaseIndex)).toEqual(KUKAI_PHASES.map((_, i) => i));
  });

  it("isAtOrAfter は境界を含み、前後関係を守る", () => {
    expect(isAtOrAfter("draft", "draft")).toBe(true);
    expect(isAtOrAfter("closed", "draft")).toBe(true);
    expect(isAtOrAfter("draft", "closed")).toBe(false);
    expect(isAtOrAfter("submission", "selection")).toBe(false);
  });

  it("未知のフェーズ文字列は -1 で、どの目標より前扱い", () => {
    expect(phaseIndex("???")).toBe(-1);
    expect(isAtOrAfter("???", "draft")).toBe(false);
  });
});
