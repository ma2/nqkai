import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * フェーズ1のスキーマ（基盤：ユーザー / パスキー / セッション / 通知）。
 * 結社・句会・投句などはフェーズ2以降で追加する。
 *
 * - 主キーはすべて TEXT（crypto.randomUUID() の v4）。
 * - 時刻は UNIX ミリ秒の INTEGER（drizzle の timestamp_ms）。
 * - カラム名は drizzle.config.ts の casing: "snake_case" で自動変換される。
 */

const createdAt = integer({ mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

const updatedAt = integer({ mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

export const users = sqliteTable("users", {
  id: text().primaryKey(),
  /** 個人俳句一覧の公開 URL 用の推測困難なトークン */
  publicId: text().notNull().unique(),
  /** ログイン識別子。表示には使わない */
  email: text().notNull().unique(),
  /** 俳号（表示名）。1人1つ */
  haigo: text().notNull(),
  /** R2 のオブジェクトキー */
  avatarKey: text(),
  isSystemAdmin: integer({ mode: "boolean" }).notNull().default(false),
  status: text({ enum: ["active", "suspended"] })
    .notNull()
    .default("active"),
  createdAt,
  updatedAt,
});

export const webauthnCredentials = sqliteTable(
  "webauthn_credentials",
  {
    /** credential ID（base64url） */
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** COSE 公開鍵（base64url） */
    publicKey: text().notNull(),
    /** 署名カウンタ */
    counter: integer().notNull().default(0),
    /** AuthenticatorTransport[] の JSON 文字列 */
    transports: text(),
    /** ユーザー設定の表示名（例：「iPhone」） */
    deviceName: text(),
    createdAt,
    lastUsedAt: integer({ mode: "timestamp_ms" }),
  },
  (t) => [index("webauthn_credentials_user_id_idx").on(t.userId)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** セッショントークンの SHA-256 ハッシュ（hex） */
    id: text().primaryKey(),
    kind: text({ enum: ["member", "guest"] }).notNull(),
    /** kind = 'member' のとき非 NULL */
    userId: text().references(() => users.id, { onDelete: "cascade" }),
    userAgent: text(),
    createdAt,
    expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text().notNull(),
    /** JSON（結社 ID、句会 ID、フェーズ名など） */
    payload: text().notNull().default("{}"),
    readAt: integer({ mode: "timestamp_ms" }),
    createdAt,
  },
  (t) => [index("notifications_user_id_read_at_idx").on(t.userId, t.readAt)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type WebauthnCredential = typeof webauthnCredentials.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
