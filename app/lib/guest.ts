/** ゲストコードの有効性判定（純関数）。DB 型と結合しないよう最小限の形で受け取る。 */
export interface GuestCodeLike {
  revokedAt: Date | null;
  expiresAt: Date;
}

/** 参加時に使える状態か（期限内・未失効・使用上限内）。 */
export function isGuestCodeUsable(
  code: GuestCodeLike & { maxUses: number | null; usedCount: number },
  now = new Date(),
): boolean {
  if (code.revokedAt != null) return false;
  if (code.expiresAt.getTime() <= now.getTime()) return false;
  if (code.maxUses != null && code.usedCount >= code.maxUses) return false;
  return true;
}

/** 参加後のアクセス可否（使用上限は関係なく、期限・失効状態のみで見る）。 */
export function isGuestCodeStillValid(code: GuestCodeLike, now = new Date()): boolean {
  return code.revokedAt == null && code.expiresAt.getTime() > now.getTime();
}
