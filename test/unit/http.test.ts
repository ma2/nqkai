import { describe, expect, it } from "vitest";
import { assertTrustedRequest, clientIp, firstZodError } from "~/server/http.server";

describe("firstZodError", () => {
  it("最初の issue のメッセージを返す", () => {
    expect(firstZodError({ issues: [{ message: "AAA" }, { message: "BBB" }] })).toBe("AAA");
  });
  it("issue が無ければ既定文", () => {
    expect(firstZodError({ issues: [] })).toBe("入力内容を確認してください");
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) => new Request("https://nqkai.test/", { headers });

  it("cf-connecting-ip を優先", () => {
    expect(clientIp(req({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe(
      "1.2.3.4",
    );
  });
  it("無ければ x-forwarded-for", () => {
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9" }))).toBe("9.9.9.9");
  });
  it("どちらも無ければ null", () => {
    expect(clientIp(req({}))).toBeNull();
  });
});

describe("assertTrustedRequest（Sec-Fetch-Site 経路）", () => {
  const post = (headers: Record<string, string>) =>
    new Request("https://nqkai.test/api/x", { method: "POST", headers });

  it("Origin 無し + Sec-Fetch-Site: same-origin は許可", () => {
    expect(() => assertTrustedRequest(post({ "sec-fetch-site": "same-origin" }))).not.toThrow();
  });
  it("Origin 無し + Sec-Fetch-Site: none は許可", () => {
    expect(() => assertTrustedRequest(post({ "sec-fetch-site": "none" }))).not.toThrow();
  });
  it("Origin 無し + Sec-Fetch-Site: cross-site は 403", () => {
    try {
      assertTrustedRequest(post({ "sec-fetch-site": "cross-site" }));
      expect.unreachable();
    } catch (e) {
      expect((e as Response).status).toBe(403);
    }
  });
  it("Origin も Sec-Fetch-Site も無い POST は 403", () => {
    try {
      assertTrustedRequest(post({}));
      expect.unreachable();
    } catch (e) {
      expect((e as Response).status).toBe(403);
    }
  });
  it("HEAD は常に許可", () => {
    expect(() =>
      assertTrustedRequest(new Request("https://nqkai.test/", { method: "HEAD" })),
    ).not.toThrow();
  });
});
