import { describe, expect, it } from "vitest";
import {
  commentSchema,
  emailSchema,
  guestCodeIssueSchema,
  guestJoinSchema,
  haigoSchema,
  kukaiSettingsSchema,
  selectionSchema,
  submissionSchema,
} from "~/lib/schemas";

describe("emailSchema", () => {
  it("前後空白を除去し小文字化する", () => {
    expect(emailSchema.parse("  Foo@Example.COM ")).toBe("foo@example.com");
  });
  it("形式不正は弾く", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("haigoSchema", () => {
  it("trim してから長さ判定", () => {
    expect(haigoSchema.parse("  芭蕉  ")).toBe("芭蕉");
    expect(haigoSchema.safeParse("   ").success).toBe(false);
    expect(haigoSchema.safeParse("あ".repeat(31)).success).toBe(false);
    expect(haigoSchema.safeParse("あ".repeat(30)).success).toBe(true);
  });
});

describe("submissionSchema / commentSchema", () => {
  it("句は trim・1〜120 文字", () => {
    expect(submissionSchema.parse({ content: "  古池や  " }).content).toBe("古池や");
    expect(submissionSchema.safeParse({ content: "  " }).success).toBe(false);
    expect(submissionSchema.safeParse({ content: "あ".repeat(121) }).success).toBe(false);
  });
  it("コメントは trim・1〜1000 文字", () => {
    expect(commentSchema.safeParse({ submissionId: "s1", body: "  " }).success).toBe(false);
    expect(commentSchema.safeParse({ submissionId: "s1", body: "い".repeat(1000) }).success).toBe(
      true,
    );
  });
});

describe("selectionSchema", () => {
  it("kind は special / regular / reverse のみ", () => {
    expect(selectionSchema.parse({ submissionId: "s1", kind: "special" }).kind).toBe("special");
    expect(selectionSchema.safeParse({ submissionId: "s1", kind: "bogus" }).success).toBe(false);
    expect(selectionSchema.safeParse({ submissionId: "", kind: "regular" }).success).toBe(false);
  });
});

describe("kukaiSettingsSchema", () => {
  const base = {
    name: "一月例会",
    submissionsPerUser: "2",
    specialCount: "1",
    regularCount: "3",
    reverseCount: "0",
    specialPoints: "3",
    regularPoints: "1",
    reversePoints: "-1",
    visibility: "public",
  };

  it("数値文字列を coerce し、逆選のマイナス点も許可する", () => {
    const r = kukaiSettingsSchema.parse({ ...base });
    expect(r.submissionsPerUser).toBe(2);
    expect(r.reversePoints).toBe(-1);
    expect(r.description).toBe("");
    expect(r.theme).toBe("");
  });

  it("範囲外は弾く（投句数の下限は 1、点数は ±20）", () => {
    expect(kukaiSettingsSchema.safeParse({ ...base, submissionsPerUser: "0" }).success).toBe(false);
    expect(kukaiSettingsSchema.safeParse({ ...base, regularPoints: "21" }).success).toBe(false);
    expect(kukaiSettingsSchema.safeParse({ ...base, reversePoints: "-21" }).success).toBe(false);
  });

  it("予定日時：空文字は null、ISO 文字列は Date、壊れた文字列はエラー", () => {
    const empty = kukaiSettingsSchema.parse({ ...base });
    expect(empty.scheduledSubmissionStartAt).toBeNull();

    const withDate = kukaiSettingsSchema.parse({
      ...base,
      scheduledSubmissionStartAt: "2026-01-10T09:00",
    });
    expect(withDate.scheduledSubmissionStartAt).toBeInstanceOf(Date);
    expect(withDate.scheduledSubmissionStartAt?.getFullYear()).toBe(2026);

    expect(kukaiSettingsSchema.safeParse({ ...base, scheduledResultAt: "いつか" }).success).toBe(
      false,
    );
  });

  it("visibility は public / private のみ", () => {
    expect(kukaiSettingsSchema.safeParse({ ...base, visibility: "secret" }).success).toBe(false);
  });
});

describe("guestJoinSchema", () => {
  it("前後空白を除去する", () => {
    expect(guestJoinSchema.parse({ code: "  abc123  " }).code).toBe("abc123");
  });
  it("空文字は弾く", () => {
    expect(guestJoinSchema.safeParse({ code: "" }).success).toBe(false);
  });
});

describe("guestCodeIssueSchema", () => {
  it("空欄は無制限（null）", () => {
    expect(guestCodeIssueSchema.parse({ maxUses: "" }).maxUses).toBeNull();
    expect(guestCodeIssueSchema.parse({}).maxUses).toBeNull();
  });
  it("1〜1000の整数は通す", () => {
    expect(guestCodeIssueSchema.parse({ maxUses: "10" }).maxUses).toBe(10);
  });
  it("範囲外・非整数は弾く", () => {
    expect(guestCodeIssueSchema.safeParse({ maxUses: "0" }).success).toBe(false);
    expect(guestCodeIssueSchema.safeParse({ maxUses: "1001" }).success).toBe(false);
    expect(guestCodeIssueSchema.safeParse({ maxUses: "1.5" }).success).toBe(false);
  });
});
