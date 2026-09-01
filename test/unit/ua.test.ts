import { describe, expect, it } from "vitest";
import { deviceLabelFromUA } from "~/lib/ua";

describe("deviceLabelFromUA", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "iPhone のパスキー"],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "iPad のパスキー"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8)", "Android 端末のパスキー"],
    ["Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)", "Chromebook のパスキー"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "Mac のパスキー"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Windows PC のパスキー"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "Linux 端末のパスキー"],
  ])("%s → %s", (ua, label) => {
    expect(deviceLabelFromUA(ua)).toBe(label);
  });

  it("iPad は Mac 判定より先に評価される", () => {
    // iPadOS の UA は "like Mac OS X" を含むが iPad ラベルになること
    expect(deviceLabelFromUA("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(
      "iPad のパスキー",
    );
  });

  it("不明・null は既定ラベル", () => {
    expect(deviceLabelFromUA(null)).toBe("パスキー");
    expect(deviceLabelFromUA(undefined)).toBe("パスキー");
    expect(deviceLabelFromUA("curl/8.0")).toBe("パスキー");
  });
});
