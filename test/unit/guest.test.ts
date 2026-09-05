import { describe, expect, it } from "vitest";
import { isGuestCodeStillValid, isGuestCodeUsable } from "~/lib/guest";

const base = {
  revokedAt: null as Date | null,
  expiresAt: new Date("2026-06-01T00:00:00Z"),
  maxUses: null as number | null,
  usedCount: 0,
};
const now = new Date("2026-01-01T00:00:00Z");

describe("isGuestCodeUsable", () => {
  it("期限内・未失効・上限内なら使える", () => {
    expect(isGuestCodeUsable(base, now)).toBe(true);
  });
  it("失効済みなら使えない", () => {
    expect(isGuestCodeUsable({ ...base, revokedAt: now }, now)).toBe(false);
  });
  it("期限切れなら使えない", () => {
    expect(isGuestCodeUsable({ ...base, expiresAt: new Date("2025-12-31T00:00:00Z") }, now)).toBe(
      false,
    );
  });
  it("使用上限に達していたら使えない", () => {
    expect(isGuestCodeUsable({ ...base, maxUses: 3, usedCount: 3 }, now)).toBe(false);
  });
  it("使用上限未満なら使える", () => {
    expect(isGuestCodeUsable({ ...base, maxUses: 3, usedCount: 2 }, now)).toBe(true);
  });
});

describe("isGuestCodeStillValid", () => {
  it("期限内・未失効ならアクセス可（使用上限は見ない）", () => {
    const exhausted = { ...base, maxUses: 1, usedCount: 99 };
    expect(isGuestCodeStillValid(exhausted, now)).toBe(true);
  });
  it("失効済みならアクセス不可", () => {
    expect(isGuestCodeStillValid({ ...base, revokedAt: now }, now)).toBe(false);
  });
  it("期限切れならアクセス不可", () => {
    expect(
      isGuestCodeStillValid({ ...base, expiresAt: new Date("2025-12-31T00:00:00Z") }, now),
    ).toBe(false);
  });
});
