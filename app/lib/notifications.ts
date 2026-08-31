import { KUKAI_PHASE_LABEL, type KukaiPhase } from "./constants";

/** 種別ごとの既定の通知本文。ペイロードを見ない汎用文。 */
export const NOTIFICATION_MESSAGES: Record<string, string> = {
  join_request_received: "結社への参加申請が届きました",
  join_approved: "結社への参加が承認されました",
  join_rejected: "結社への参加申請が却下されました",
  member_removed: "結社から退会処理されました",
  role_changed: "結社での役割が変更されました",
  organization_closed: "結社が閉鎖されました",
  recovery_requested: "パスキー復旧の依頼が届きました",
  recovery_code_issued: "パスキー復旧コードが発行されました",
  recovery_code_used: "パスキー復旧コードが使用されました",
  phase_changed: "句会のフェーズが変わりました",
  kukai_deleted: "句会が削除されました",
};

const phaseLabel = (p: unknown): string | null =>
  typeof p === "string" && p in KUKAI_PHASE_LABEL ? KUKAI_PHASE_LABEL[p as KukaiPhase] : null;

/**
 * 通知本文。ペイロードがあれば具体的な文面にする（issue #11）。
 * 旧い通知（ペイロードに fromPhase が無い）は汎用文へフォールバックする。
 */
export function notificationMessage(type: string, payload: Record<string, unknown>): string {
  if (type === "phase_changed") {
    const from = phaseLabel(payload.fromPhase);
    const to = phaseLabel(payload.phase);
    const name = typeof payload.kukaiName === "string" ? payload.kukaiName : "句会";
    if (from && to) return `「${name}」のフェーズが「${from}」から「${to}」に変わりました`;
    if (to) return `「${name}」のフェーズが「${to}」に変わりました`;
  }
  return NOTIFICATION_MESSAGES[type] ?? type;
}
