import { z } from "zod";

export const haigoSchema = z
  .string()
  .trim()
  .min(1, "俳号を入力してください")
  .max(30, "俳号は30文字以内で入力してください");

// 先に trim + 小文字化してから形式を検証する（前後空白で弾かない）。
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("メールアドレスの形式が正しくありません").max(254, "メールアドレスが長すぎます"));

export const deviceNameSchema = z
  .string()
  .trim()
  .max(50, "デバイス名は50文字以内で入力してください");

/** 新規登録の開始（オプション取得）入力 */
export const registerStartSchema = z.object({
  email: emailSchema,
  haigo: haigoSchema,
});
export type RegisterStartInput = z.infer<typeof registerStartSchema>;

/** ログインの開始（オプション取得）入力。email 省略時は discoverable credential を許可 */
export const loginStartSchema = z.object({
  email: emailSchema.optional(),
});

/** 認証子追加の開始入力 */
export const credentialStartSchema = z.object({
  deviceName: deviceNameSchema.optional(),
});

/** プロフィール更新入力 */
export const profileUpdateSchema = z.object({
  haigo: haigoSchema,
});

// ---- フェーズ2：結社 --------------------------------------------------

export const orgNameSchema = z
  .string()
  .trim()
  .min(1, "結社名を入力してください")
  .max(60, "結社名は60文字以内で入力してください");

export const orgDescriptionSchema = z
  .string()
  .trim()
  .max(2000, "説明は2000文字以内で入力してください");

export const orgCreateSchema = z.object({
  name: orgNameSchema,
  description: orgDescriptionSchema.optional().default(""),
});

export const orgUpdateSchema = orgCreateSchema;

export const joinRequestSchema = z.object({
  message: z.string().trim().max(500, "メッセージは500文字以内で入力してください").optional(),
});

// ---- フェーズ2：アカウント復旧（案D） --------------------------------

/** 復旧依頼（未認証） */
export const recoveryRequestSchema = z.object({
  email: emailSchema,
  note: z.string().trim().max(500).optional(),
});

// ---- フェーズ3：句会 --------------------------------------------------

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), "日時の形式が正しくありません");

export const kukaiSettingsSchema = z.object({
  name: z.string().trim().min(1, "句会名を入力してください").max(80),
  description: z.string().trim().max(2000).optional().default(""),
  theme: z.string().trim().max(100).optional().default(""),
  submissionsPerUser: z.coerce.number().int().min(1).max(20),
  specialCount: z.coerce.number().int().min(0).max(50),
  regularCount: z.coerce.number().int().min(0).max(50),
  reverseCount: z.coerce.number().int().min(0).max(50),
  specialPoints: z.coerce.number().int().min(-20).max(20),
  regularPoints: z.coerce.number().int().min(-20).max(20),
  reversePoints: z.coerce.number().int().min(-20).max(20),
  visibility: z.enum(["public", "private"]),
  scheduledSubmissionStartAt: optionalDate,
  scheduledSubmissionEndAt: optionalDate,
  scheduledSelectionStartAt: optionalDate,
  scheduledSelectionEndAt: optionalDate,
  scheduledResultAt: optionalDate,
  scheduledCommentStartAt: optionalDate,
  scheduledCommentEndAt: optionalDate,
});
export type KukaiSettingsInput = z.infer<typeof kukaiSettingsSchema>;

export const submissionSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "句を入力してください")
    .max(120, "120文字以内で入力してください"),
});

export const selectionSchema = z.object({
  submissionId: z.string().min(1),
  kind: z.enum(["special", "regular", "reverse"]),
});

export const commentSchema = z.object({
  submissionId: z.string().min(1),
  body: z.string().trim().min(1, "コメントを入力してください").max(1000),
});

/** ゲスト参加（`/guest?code=`） */
export const guestJoinSchema = z.object({
  code: z.string().trim().min(1, "コードを入力してください").max(64),
});

/** ゲストコードの発行（主催者）。使用上限は空欄なら無制限 */
export const guestCodeIssueSchema = z.object({
  maxUses: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine(
      (n) => n === null || (Number.isInteger(n) && n >= 1 && n <= 1000),
      "使用上限は1〜1000の整数で入力してください",
    ),
});

/** 復旧コードでの再登録開始（未認証） */
export const recoveryRedeemStartSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .trim()
    .min(1, "コードを入力してください")
    .max(40, "コードが長すぎます")
    // 表示は ABCD-EFGH-JKMN 形式。ハイフン・空白・大文字小文字を吸収
    .transform((v) => v.replace(/[\s-]/g, "").toUpperCase()),
});
