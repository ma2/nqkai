/** セッション Cookie 名（__Host- プレフィックスで Secure/Path=/ を強制） */
export const SESSION_COOKIE_NAME = "__Host-session";

/** セッション有効期限：30日 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 残り期限がこれを下回ったらスライド再発行：7日 */
export const SESSION_RENEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/** WebAuthn チャレンジの KV TTL：5分 */
export const WEBAUTHN_CHALLENGE_TTL_SECONDS = 300;

/** パスキー復旧コードの有効期間：24時間 */
export const RECOVERY_CODE_TTL_MS = 24 * 60 * 60 * 1000;

/** アプリ内通知の種別 */
export const NOTIFICATION_TYPES = [
  "join_request_received",
  "join_approved",
  "join_rejected",
  "member_removed",
  "role_changed",
  "organization_closed",
  "recovery_requested",
  "recovery_code_issued",
  "recovery_code_used",
  "phase_changed",
  "kukai_deleted",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** 結社ロール */
export const ORG_ROLES = ["admin", "deputy_admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  admin: "管理者",
  deputy_admin: "副管理者",
  member: "メンバー",
};
