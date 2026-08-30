import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { NotificationType } from "~/lib/constants";
import { newId } from "~/lib/id";
import type { Db } from "./db/client.server";
import { notifications } from "./db/schema";

interface NewNotification {
  userId: string;
  type: NotificationType;
  payload?: Record<string, unknown>;
}

/** 1件作成。 */
export function notify(db: Db, n: NewNotification) {
  return db.insert(notifications).values({
    id: newId(),
    userId: n.userId,
    type: n.type,
    payload: JSON.stringify(n.payload ?? {}),
  });
}

/** 複数ユーザーへ同じ通知をまとめて作成。 */
export function notifyMany(
  db: Db,
  userIds: string[],
  type: NotificationType,
  payload?: Record<string, unknown>,
) {
  if (userIds.length === 0) return Promise.resolve(undefined);
  const body = JSON.stringify(payload ?? {});
  return db
    .insert(notifications)
    .values(userIds.map((userId) => ({ id: newId(), userId, type, payload: body })));
}

export async function listNotifications(db: Db, userId: string, limit = 50) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .all();
}

export async function countUnread(db: Db, userId: string): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .all();
  return rows.length;
}

export async function markRead(db: Db, userId: string, ids: string[]) {
  if (ids.length === 0) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), inArray(notifications.id, ids)));
}

export async function markAllRead(db: Db, userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
