/** セッション Cookie 名（__Host- プレフィックスで Secure/Path=/ を強制） */
export const SESSION_COOKIE_NAME = "__Host-session";

/** セッション有効期限：30日 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 残り期限がこれを下回ったらスライド再発行：7日 */
export const SESSION_RENEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/** WebAuthn チャレンジの KV TTL：5分 */
export const WEBAUTHN_CHALLENGE_TTL_SECONDS = 300;

/** アプリ内通知の種別（フェーズ2以降で発火） */
export const NOTIFICATION_TYPES = [
  "join_request_received",
  "join_approved",
  "join_rejected",
  "phase_changed",
  "kukai_deleted",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
