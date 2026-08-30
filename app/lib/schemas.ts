import { z } from "zod";

export const haigoSchema = z
  .string()
  .trim()
  .min(1, "俳号を入力してください")
  .max(30, "俳号は30文字以内で入力してください");

export const emailSchema = z
  .email("メールアドレスの形式が正しくありません")
  .max(254, "メールアドレスが長すぎます")
  .transform((v) => v.trim().toLowerCase());

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
