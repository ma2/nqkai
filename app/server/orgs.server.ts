import { and, eq, inArray, sql } from "drizzle-orm";
import type { OrgRole } from "~/lib/constants";
import { newId } from "~/lib/id";
import type { Db } from "./db/client.server";
import {
  organizationJoinRequests,
  organizationMemberships,
  organizations,
  users,
} from "./db/schema";
import { notify, notifyMany } from "./notifications.server";

/** 業務エラー（loader/action で 409 として返す） */
export class OrgError extends Error {}

// ---- 結社 CRUD -------------------------------------------------------

export async function createOrganization(
  db: Db,
  userId: string,
  input: { name: string; description?: string },
) {
  const id = newId();
  const now = new Date();
  await db.batch([
    db.insert(organizations).values({
      id,
      name: input.name,
      description: input.description ?? "",
      createdBy: userId,
    }),
    db.insert(organizationMemberships).values({
      id: newId(),
      organizationId: id,
      userId,
      role: "admin",
      joinedAt: now,
    }),
  ]);
  return id;
}

export async function listOrganizations(db: Db) {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      description: organizations.description,
      status: organizations.status,
      imageKey: organizations.imageKey,
      updatedAt: organizations.updatedAt,
      memberCount: sql<number>`(
        select count(*) from ${organizationMemberships}
        where ${organizationMemberships.organizationId} = ${organizations.id}
      )`,
    })
    .from(organizations)
    .orderBy(organizations.name)
    .all();
  return rows;
}

export async function updateOrganization(
  db: Db,
  orgId: string,
  input: { name: string; description?: string },
) {
  await db
    .update(organizations)
    .set({ name: input.name, description: input.description ?? "", updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}

export async function setOrganizationImageKey(db: Db, orgId: string, imageKey: string | null) {
  await db
    .update(organizations)
    .set({ imageKey, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}

export async function getOrganizationImageKey(db: Db, orgId: string): Promise<string | null> {
  const r = await db
    .select({ imageKey: organizations.imageKey })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .get();
  return r?.imageKey ?? null;
}

export async function setOrganizationStatus(db: Db, orgId: string, status: "open" | "closed") {
  await db
    .update(organizations)
    .set({
      status,
      closedAt: status === "closed" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

// ---- メンバー -------------------------------------------------------

export async function listMembers(db: Db, orgId: string) {
  return db
    .select({
      userId: organizationMemberships.userId,
      haigo: users.haigo,
      role: organizationMemberships.role,
      joinedAt: organizationMemberships.joinedAt,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(eq(organizationMemberships.organizationId, orgId))
    .orderBy(organizationMemberships.joinedAt)
    .all();
}

/** 管理者・副管理者のユーザー ID（通知の宛先） */
export async function getManagerUserIds(db: Db, orgId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, orgId),
        inArray(organizationMemberships.role, ["admin", "deputy_admin"]),
      ),
    )
    .all();
  return rows.map((r) => r.userId);
}

async function countAdmins(db: Db, orgId: string): Promise<number> {
  const rows = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, orgId),
        eq(organizationMemberships.role, "admin"),
      ),
    )
    .all();
  return rows.length;
}

async function getMembership(db: Db, orgId: string, userId: string) {
  return db
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, orgId),
        eq(organizationMemberships.userId, userId),
      ),
    )
    .get();
}

export async function leaveOrganization(db: Db, orgId: string, userId: string) {
  const m = await getMembership(db, orgId, userId);
  if (!m) throw new OrgError("この結社のメンバーではありません");
  if (m.role === "admin" && (await countAdmins(db, orgId)) <= 1) {
    throw new OrgError("最後の管理者は退会できません。先に他のメンバーへ管理者を委譲してください");
  }
  await db.delete(organizationMemberships).where(eq(organizationMemberships.id, m.id));
}

export async function removeMember(
  db: Db,
  orgId: string,
  targetUserId: string,
  actorUserId: string,
) {
  if (targetUserId === actorUserId) {
    throw new OrgError("自分自身は「退会」から操作してください");
  }
  const m = await getMembership(db, orgId, targetUserId);
  if (!m) throw new OrgError("対象はこの結社のメンバーではありません");
  if (m.role === "admin" && (await countAdmins(db, orgId)) <= 1) {
    throw new OrgError("最後の管理者は退会させられません");
  }
  await db.delete(organizationMemberships).where(eq(organizationMemberships.id, m.id));
  await notify(db, {
    userId: targetUserId,
    type: "member_removed",
    payload: { organizationId: orgId },
  });
}

export async function setMemberRole(db: Db, orgId: string, targetUserId: string, role: OrgRole) {
  const m = await getMembership(db, orgId, targetUserId);
  if (!m) throw new OrgError("対象はこの結社のメンバーではありません");
  if (m.role === role) return;
  if (m.role === "admin" && role !== "admin" && (await countAdmins(db, orgId)) <= 1) {
    throw new OrgError("最後の管理者の役割は変更できません");
  }
  await db
    .update(organizationMemberships)
    .set({ role, updatedAt: new Date() })
    .where(eq(organizationMemberships.id, m.id));
  await notify(db, {
    userId: targetUserId,
    type: "role_changed",
    payload: { organizationId: orgId, role },
  });
}

// ---- 参加申請 -----------------------------------------------------

export async function createJoinRequest(
  db: Db,
  orgId: string,
  userId: string,
  message: string | undefined,
) {
  const org = await db
    .select({ status: organizations.status })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .get();
  if (!org) throw new OrgError("結社が見つかりません");
  if (org.status === "closed") throw new OrgError("閉鎖された結社には参加申請できません");
  if (await getMembership(db, orgId, userId)) {
    throw new OrgError("すでにこの結社のメンバーです");
  }
  const existing = await db
    .select({ id: organizationJoinRequests.id })
    .from(organizationJoinRequests)
    .where(
      and(
        eq(organizationJoinRequests.organizationId, orgId),
        eq(organizationJoinRequests.userId, userId),
        eq(organizationJoinRequests.status, "pending"),
      ),
    )
    .get();
  if (existing) throw new OrgError("すでに申請中です");

  await db.insert(organizationJoinRequests).values({
    id: newId(),
    organizationId: orgId,
    userId,
    message: message ?? null,
  });
  await notifyMany(db, await getManagerUserIds(db, orgId), "join_request_received", {
    organizationId: orgId,
    userId,
  });
}

export async function withdrawJoinRequest(db: Db, orgId: string, userId: string) {
  const r = await db
    .select()
    .from(organizationJoinRequests)
    .where(
      and(
        eq(organizationJoinRequests.organizationId, orgId),
        eq(organizationJoinRequests.userId, userId),
        eq(organizationJoinRequests.status, "pending"),
      ),
    )
    .get();
  if (!r) throw new OrgError("取り下げられる申請がありません");
  await db
    .update(organizationJoinRequests)
    .set({ status: "withdrawn", decidedAt: new Date() })
    .where(eq(organizationJoinRequests.id, r.id));
}

export async function listPendingJoinRequests(db: Db, orgId: string) {
  return db
    .select({
      id: organizationJoinRequests.id,
      userId: organizationJoinRequests.userId,
      haigo: users.haigo,
      email: users.email,
      message: organizationJoinRequests.message,
      createdAt: organizationJoinRequests.createdAt,
    })
    .from(organizationJoinRequests)
    .innerJoin(users, eq(users.id, organizationJoinRequests.userId))
    .where(
      and(
        eq(organizationJoinRequests.organizationId, orgId),
        eq(organizationJoinRequests.status, "pending"),
      ),
    )
    .orderBy(organizationJoinRequests.createdAt)
    .all();
}

async function decideJoinRequest(
  db: Db,
  requestId: string,
  orgId: string,
  deciderId: string,
  decision: "approved" | "rejected",
) {
  const r = await db
    .select()
    .from(organizationJoinRequests)
    .where(eq(organizationJoinRequests.id, requestId))
    .get();
  if (!r || r.organizationId !== orgId || r.status !== "pending") {
    throw new OrgError("対象の申請が見つかりません");
  }

  if (decision === "approved" && !(await getMembership(db, orgId, r.userId))) {
    await db.insert(organizationMemberships).values({
      id: newId(),
      organizationId: orgId,
      userId: r.userId,
      role: "member",
      joinedAt: new Date(),
    });
  }
  await db
    .update(organizationJoinRequests)
    .set({ status: decision, decidedBy: deciderId, decidedAt: new Date() })
    .where(eq(organizationJoinRequests.id, requestId));
  await notify(db, {
    userId: r.userId,
    type: decision === "approved" ? "join_approved" : "join_rejected",
    payload: { organizationId: orgId },
  });
}

export const approveJoinRequest = (db: Db, requestId: string, orgId: string, deciderId: string) =>
  decideJoinRequest(db, requestId, orgId, deciderId, "approved");

export const rejectJoinRequest = (db: Db, requestId: string, orgId: string, deciderId: string) =>
  decideJoinRequest(db, requestId, orgId, deciderId, "rejected");

// ---- 詳細（画面用集約） ------------------------------------------

export async function getOrganizationOverview(db: Db, orgId: string, viewerUserId: string | null) {
  const memberCountRow = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.organizationId, orgId))
    .all();

  let pendingRequest = false;
  if (viewerUserId) {
    const r = await db
      .select({ id: organizationJoinRequests.id })
      .from(organizationJoinRequests)
      .where(
        and(
          eq(organizationJoinRequests.organizationId, orgId),
          eq(organizationJoinRequests.userId, viewerUserId),
          eq(organizationJoinRequests.status, "pending"),
        ),
      )
      .get();
    pendingRequest = !!r;
  }

  return { memberCount: memberCountRow.length, pendingRequest };
}

/** ユーザーが所属する結社一覧（ダッシュボード用） */
export async function listMyOrganizations(db: Db, userId: string) {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      status: organizations.status,
      role: organizationMemberships.role,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(eq(organizationMemberships.userId, userId))
    .orderBy(organizations.name)
    .all();
}
