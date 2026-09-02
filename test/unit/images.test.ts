import { describe, expect, it } from "vitest";
import { IMAGE_MAX_BYTES, validateImageUpload } from "~/server/images.server";

const file = (bytes: number, type: string) => new File([new Uint8Array(bytes)], "x", { type });

describe("validateImageUpload", () => {
  it("PNG / JPEG / WebP を受け入れる", () => {
    for (const t of ["image/png", "image/jpeg", "image/webp"]) {
      const r = validateImageUpload(file(10, t));
      expect(r).toEqual({ file: expect.any(File) });
    }
  });

  it("File でない・空ファイルは選択を促す", () => {
    expect(validateImageUpload(null)).toEqual({ error: "画像ファイルを選択してください" });
    expect(validateImageUpload("dummy" as unknown as File)).toEqual({
      error: "画像ファイルを選択してください",
    });
    expect(validateImageUpload(file(0, "image/png"))).toEqual({
      error: "画像ファイルを選択してください",
    });
  });

  it("対応外の MIME 型は弾く", () => {
    expect(validateImageUpload(file(10, "image/gif"))).toEqual({
      error: "PNG / JPEG / WebP のみ対応しています",
    });
  });

  it("2MB 超は弾く（境界値）", () => {
    expect(validateImageUpload(file(IMAGE_MAX_BYTES, "image/png"))).toEqual({
      file: expect.any(File),
    });
    expect(validateImageUpload(file(IMAGE_MAX_BYTES + 1, "image/png"))).toEqual({
      error: "画像は 2MB 以下にしてください",
    });
  });
});
