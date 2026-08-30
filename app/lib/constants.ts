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

/** 句会フェーズ（この順に advance / rewind する） */
export const KUKAI_PHASES = [
  "draft",
  "preparing",
  "submission",
  "submission_closed",
  "selection",
  "selection_closed",
  "result",
  "commenting",
  "comment_closed",
  "closed",
] as const;
export type KukaiPhase = (typeof KUKAI_PHASES)[number];

export const KUKAI_PHASE_LABEL: Record<KukaiPhase, string> = {
  draft: "準備中",
  preparing: "受付開始",
  submission: "投句期間",
  submission_closed: "投句締切",
  selection: "選句期間",
  selection_closed: "選句締切",
  result: "結果発表",
  commenting: "講評期間",
  comment_closed: "講評締切",
  closed: "終了",
};

export const SELECTION_KIND_LABEL = {
  special: "特選",
  regular: "並選",
  reverse: "逆選",
} as const;
export type SelectionKind = keyof typeof SELECTION_KIND_LABEL;

export function phaseIndex(p: string): number {
  return (KUKAI_PHASES as readonly string[]).indexOf(p);
}
export function isAtOrAfter(phase: string, target: KukaiPhase): boolean {
  return phaseIndex(phase) >= phaseIndex(target);
}
