import { describe, expect, it } from "vitest";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  readSessionToken,
} from "~/server/auth.server";

const NAME = "__Host-session";

describe("buildSessionCookie", () => {
  it("__Host- 前提の属性（Secure / HttpOnly / SameSite=Lax / Path=/）を必ず持つ", () => {
    const c = buildSessionCookie("tok123", new Date(Date.now() + 60_000));
    expect(c).toMatch(new RegExp(`^${NAME}=tok123;`));
    expect(c).toContain("Path=/");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(c).toContain("SameSite=Lax");
  });

  it("Max-Age は残り秒数、過去日時なら 0 でマイナスにしない", () => {
    const future = buildSessionCookie("t", new Date(Date.now() + 120_000));
    const maxAge = Number(future.match(/Max-Age=(\d+)/)![1]);
    expect(maxAge).toBeGreaterThan(100);
    expect(maxAge).toBeLessThanOrEqual(120);

    const past = buildSessionCookie("t", new Date(Date.now() - 1000));
    expect(past).toContain("Max-Age=0");
  });
});

describe("buildClearSessionCookie", () => {
  it("空値 + Max-Age=0 で即時失効、属性は発行時と揃える", () => {
    const c = buildClearSessionCookie();
    expect(c).toMatch(new RegExp(`^${NAME}=;`));
    expect(c).toContain("Max-Age=0");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(c).toContain("SameSite=Lax");
  });
});

describe("readSessionToken", () => {
  const withCookie = (v: string) => new Request("https://nqkai.test/", { headers: { cookie: v } });

  it("Cookie ヘッダから対象の値を取り出す", () => {
    expect(readSessionToken(withCookie(`${NAME}=abc`))).toBe("abc");
  });
  it("複数 Cookie に混在していても取り出す", () => {
    expect(readSessionToken(withCookie(`foo=1; ${NAME}=abc; bar=2`))).toBe("abc");
  });
  it("空値・未設定・ヘッダ無しは null", () => {
    expect(readSessionToken(withCookie(`${NAME}=`))).toBeNull();
    expect(readSessionToken(withCookie("foo=1; bar=2"))).toBeNull();
    expect(readSessionToken(new Request("https://nqkai.test/"))).toBeNull();
  });
});
