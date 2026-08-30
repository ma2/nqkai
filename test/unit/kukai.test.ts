import { describe, expect, it } from "vitest";
import { isAtOrAfter, KUKAI_PHASES, phaseIndex } from "~/lib/constants";

describe("句会フェーズ", () => {
  it("draft が先頭、closed が末尾", () => {
    expect(KUKAI_PHASES[0]).toBe("draft");
    expect(KUKAI_PHASES[KUKAI_PHASES.length - 1]).toBe("closed");
  });

  it("phaseIndex は順序を返す", () => {
    expect(phaseIndex("draft")).toBe(0);
    expect(phaseIndex("submission")).toBeLessThan(phaseIndex("selection"));
    expect(phaseIndex("unknown")).toBe(-1);
  });

  it("isAtOrAfter", () => {
    expect(isAtOrAfter("result", "result")).toBe(true);
    expect(isAtOrAfter("commenting", "result")).toBe(true);
    expect(isAtOrAfter("selection", "result")).toBe(false);
  });
});
