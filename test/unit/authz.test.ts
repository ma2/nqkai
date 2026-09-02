import { describe, expect, it } from "vitest";
import type { OrgRole } from "~/lib/constants";
import {
  assertCanManageOrg,
  assertOrgAdmin,
  canManageOrg,
  hasOrgRole,
  isOrgAdmin,
  type OrgContext,
} from "~/server/authz.server";

const ctx = (role: OrgRole | null): OrgContext =>
  ({ organization: { id: "o1" }, role }) as OrgContext;

describe("hasOrgRole", () => {
  it("ロール階数の下限を満たすか（member < deputy_admin < admin）", () => {
    expect(hasOrgRole(ctx("admin"), "deputy_admin")).toBe(true);
    expect(hasOrgRole(ctx("deputy_admin"), "deputy_admin")).toBe(true);
    expect(hasOrgRole(ctx("member"), "deputy_admin")).toBe(false);
    expect(hasOrgRole(ctx("member"), "member")).toBe(true);
    expect(hasOrgRole(ctx(null), "member")).toBe(false);
  });
});

describe("canManageOrg", () => {
  it("副管理者以上、またはシステム管理者のみ true", () => {
    expect(canManageOrg(ctx("admin"), false)).toBe(true);
    expect(canManageOrg(ctx("deputy_admin"), false)).toBe(true);
    expect(canManageOrg(ctx("member"), false)).toBe(false);
    expect(canManageOrg(ctx(null), false)).toBe(false);
  });
  it("非会員でもシステム管理者なら true", () => {
    expect(canManageOrg(ctx(null), true)).toBe(true);
    expect(canManageOrg(ctx("member"), true)).toBe(true);
  });
});

describe("isOrgAdmin", () => {
  it("結社管理者、またはシステム管理者のみ true（副管理者は false）", () => {
    expect(isOrgAdmin(ctx("admin"), false)).toBe(true);
    expect(isOrgAdmin(ctx("deputy_admin"), false)).toBe(false);
    expect(isOrgAdmin(ctx("member"), false)).toBe(false);
    expect(isOrgAdmin(ctx(null), true)).toBe(true);
  });
});

describe("assert 版は 403 を throw する", () => {
  it("assertCanManageOrg", () => {
    expect(() => assertCanManageOrg(ctx("deputy_admin"), false)).not.toThrow();
    try {
      assertCanManageOrg(ctx("member"), false);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(403);
    }
  });
  it("assertOrgAdmin", () => {
    expect(() => assertOrgAdmin(ctx("admin"), false)).not.toThrow();
    try {
      assertOrgAdmin(ctx("deputy_admin"), false);
      expect.unreachable();
    } catch (e) {
      expect((e as Response).status).toBe(403);
    }
  });
});
