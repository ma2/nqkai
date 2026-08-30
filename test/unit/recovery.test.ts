import { describe, expect, it } from "vitest";
import { humanCode, normalizeCode } from "~/lib/id";
import { recoveryRedeemStartSchema } from "~/lib/schemas";

describe("humanCode", () => {
  it("ABCD-EFGH-JKMN 形式、紛らわしい文字を含まない", () => {
    const c = humanCode();
    expect(c).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(c).not.toMatch(/[OIL01]/);
  });
  it("毎回異なる", () => {
    expect(humanCode()).not.toBe(humanCode());
  });
});

describe("normalizeCode", () => {
  it("ハイフン・空白除去 + 大文字化", () => {
    expect(normalizeCode(" abcd-efgh jkmn ")).toBe("ABCDEFGHJKMN");
  });
});

describe("recoveryRedeemStartSchema", () => {
  it("コードの表記ゆれを正規化する", () => {
    const r = recoveryRedeemStartSchema.parse({
      email: "A@Example.com",
      code: "abcd efgh-jkmn",
    });
    expect(r.email).toBe("a@example.com");
    expect(r.code).toBe("ABCDEFGHJKMN");
  });
});
