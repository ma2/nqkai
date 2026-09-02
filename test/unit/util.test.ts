import { describe, expect, it } from "vitest";
import { newToken, sha256Hex } from "~/lib/id";
import { safeNext } from "~/lib/nav";
import { assertTrustedRequest } from "~/server/http.server";

describe("sha256Hex", () => {
  it("空文字列の既知ベクトル", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
  it("同じ入力は同じハッシュ", async () => {
    expect(await sha256Hex("abc")).toBe(await sha256Hex("abc"));
  });
});

describe("newToken", () => {
  it("URL セーフで十分な長さ、毎回異なる", () => {
    const a = newToken();
    const b = newToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });
});

describe("safeNext", () => {
  it("自サイト内の絶対パスは許可（クエリ・フラグメント込み）", () => {
    expect(safeNext("/settings")).toBe("/settings");
    expect(safeNext("/kukai?tab=past#a")).toBe("/kukai?tab=past#a");
  });
  it("外部 URL・プロトコル相対・バックスラッシュ誘導はフォールバック", () => {
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("relative/path")).toBe("/");
  });
  it("空・未指定はフォールバック（既定は / 、指定も可）", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext(undefined, "/login")).toBe("/login");
    expect(safeNext("//x", "/login")).toBe("/login");
  });
});

describe("assertTrustedRequest", () => {
  it("GET は常に許可", () => {
    expect(() => assertTrustedRequest(new Request("https://nqkai.test/"))).not.toThrow();
  });
  it("同一オリジンの POST は許可", () => {
    const req = new Request("https://nqkai.test/api/x", {
      method: "POST",
      headers: { origin: "https://nqkai.test" },
    });
    expect(() => assertTrustedRequest(req)).not.toThrow();
  });
  it("クロスオリジンの POST は 403", () => {
    const req = new Request("https://nqkai.test/api/x", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(() => assertTrustedRequest(req)).toThrow();
  });
});
