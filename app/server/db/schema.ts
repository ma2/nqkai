import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * スキーマ。
 * - フェーズ1：ユーザー / パスキー / セッション / 通知
 * - フェーズ2：結社（organizations / memberships / join_requests）+ アカウント復旧（recovery_*）
 * - 句会・投句などはフェーズ3以降で追加する。
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

// ---- フェーズ2：結社 ----------------------------------------------------

export const organizations = sqliteTable("organizations", {
  /** UUID（公開 URL に使用） */
  id: text().primaryKey(),
  name: text().notNull(),
  description: text().notNull().default(""),
  status: text({ enum: ["open", "closed"] })
    .notNull()
    .default("open"),
  createdBy: text()
    .notNull()
    .references(() => users.id),
  createdAt,
  updatedAt,
  closedAt: integer({ mode: "timestamp_ms" }),
});

export const organizationMemberships = sqliteTable(
  "organization_memberships",
  {
    id: text().primaryKey(),
    organizationId: text()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text({ enum: ["admin", "deputy_admin", "member"] }).notNull(),
    joinedAt: integer({ mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("organization_memberships_org_user_uq").on(t.organizationId, t.userId),
    index("organization_memberships_user_idx").on(t.userId),
    index("organization_memberships_org_role_idx").on(t.organizationId, t.role),
  ],
);

export const organizationJoinRequests = sqliteTable(
  "organization_join_requests",
  {
    id: text().primaryKey(),
    organizationId: text()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    message: text(),
    status: text({ enum: ["pending", "approved", "rejected", "withdrawn"] })
      .notNull()
      .default("pending"),
    decidedBy: text().references(() => users.id, { onDelete: "set null" }),
    decidedAt: integer({ mode: "timestamp_ms" }),
    createdAt,
  },
  (t) => [
    // 同時に複数の保留申請を作れない（部分ユニーク）
    uniqueIndex("organization_join_requests_pending_uq")
      .on(t.organizationId, t.userId)
      .where(sql`status = 'pending'`),
    index("organization_join_requests_org_status_idx").on(t.organizationId, t.status),
  ],
);

// ---- フェーズ2：アカウント復旧（案D / SPEC「5.5」） --------------------

export const recoveryRequests = sqliteTable(
  "recovery_requests",
  {
    id: text().primaryKey(),
    /** 復旧対象。既存メールに一致した場合のみ行を作る */
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 依頼が回送される結社（複数所属なら各結社に1行） */
    organizationId: text()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    status: text({ enum: ["pending", "handled", "expired"] })
      .notNull()
      .default("pending"),
    note: text(),
    createdAt,
    handledBy: text().references(() => users.id, { onDelete: "set null" }),
    handledAt: integer({ mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("recovery_requests_pending_uq")
      .on(t.userId, t.organizationId)
      .where(sql`status = 'pending'`),
    index("recovery_requests_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const accountRecoveryCodes = sqliteTable(
  "account_recovery_codes",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** コードの SHA-256（hex）。生コードは保存しない */
    codeHash: text().notNull(),
    issuedBy: text()
      .notNull()
      .references(() => users.id),
    issuedVia: text({ enum: ["organization_admin", "system_admin"] }).notNull(),
    organizationId: text().references(() => organizations.id, { onDelete: "set null" }),
    issuerIp: text(),
    usedAt: integer({ mode: "timestamp_ms" }),
    usedIp: text(),
    usedUserAgent: text(),
    expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
    createdAt,
  },
  (t) => [index("account_recovery_codes_user_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type WebauthnCredential = typeof webauthnCredentials.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationMembership = typeof organizationMemberships.$inferSelect;
export type OrgRole = OrganizationMembership["role"];
export type OrganizationJoinRequest = typeof organizationJoinRequests.$inferSelect;
export type RecoveryRequest = typeof recoveryRequests.$inferSelect;
export type AccountRecoveryCode = typeof accountRecoveryCodes.$inferSelect;
