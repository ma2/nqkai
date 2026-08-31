import { describe, expect, it } from "vitest";
import { notificationMessage } from "~/lib/notifications";

describe("通知本文", () => {
  it("phase_changed は旧→新フェーズを含む（issue #11）", () => {
    const msg = notificationMessage("phase_changed", {
      kukaiId: "k1",
      kukaiName: "一月例会",
      fromPhase: "submission",
      phase: "submission_closed",
    });
    expect(msg).toBe("「一月例会」のフェーズが「投句期間」から「投句締切」に変わりました");
  });

  it("phase_changed で旧フェーズが無い旧通知は新フェーズのみ表示", () => {
    const msg = notificationMessage("phase_changed", { kukaiId: "k1", phase: "selection" });
    expect(msg).toBe("「句会」のフェーズが「選句期間」に変わりました");
  });

  it("phase_changed でフェーズ情報が全く無ければ汎用文へフォールバック", () => {
    expect(notificationMessage("phase_changed", {})).toBe("句会のフェーズが変わりました");
  });

  it("他の種別は種別ごとの既定文", () => {
    expect(notificationMessage("join_approved", {})).toBe("結社への参加が承認されました");
  });

  it("未知の種別は種別名をそのまま返す", () => {
    expect(notificationMessage("mystery", {})).toBe("mystery");
  });
});
