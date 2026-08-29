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
