import { and, eq } from "drizzle-orm";
import type { OrgRole } from "~/lib/constants";
import type { Db } from "./db/client.server";
import { type Organization, organizationMemberships, organizations } from "./db/schema";

const ROLE_RANK: Record<OrgRole, number> = { member: 1, deputy_admin: 2, admin: 3 };

export interface OrgContext {
  organization: Organization;
  /** 当該ユーザーの結社ロール。非会員なら null */
  role: OrgRole | null;
}

/** 結社と、指定ユーザーのその結社での役割を返す。結社が無ければ 404 を throw。 */
export async function loadOrgContext(
  db: Db,
  organizationId: string,
  userId: string | null,
): Promise<OrgContext> {
  const organization = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .get();
  if (!organization) throw new Response("結社が見つかりません", { status: 404 });

  let role: OrgRole | null = null;
  if (userId) {
    const m = await db
      .select({ role: organizationMemberships.role })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.userId, userId),
        ),
      )
      .get();
    role = m?.role ?? null;
  }
  return { organization, role };
}

export function hasOrgRole(ctx: OrgContext, min: OrgRole): boolean {
  return ctx.role != null && ROLE_RANK[ctx.role] >= ROLE_RANK[min];
}

/** 結社の管理系操作（申請承認・メンバー管理・復旧コード発行など）を許可するか。 */
export function canManageOrg(ctx: OrgContext, isSystemAdmin: boolean): boolean {
  return isSystemAdmin || hasOrgRole(ctx, "deputy_admin");
}

/** 副管理者の任免・結社の閉鎖など、管理者限定の操作を許可するか。 */
export function isOrgAdmin(ctx: OrgContext, isSystemAdmin: boolean): boolean {
  return isSystemAdmin || ctx.role === "admin";
}

/** 403 を throw するアサーション版。 */
export function assertCanManageOrg(ctx: OrgContext, isSystemAdmin: boolean): void {
  if (!canManageOrg(ctx, isSystemAdmin)) {
    throw new Response("この操作の権限がありません", { status: 403 });
  }
}

export function assertOrgAdmin(ctx: OrgContext, isSystemAdmin: boolean): void {
  if (!isOrgAdmin(ctx, isSystemAdmin)) {
    throw new Response("この操作は結社管理者のみ可能です", { status: 403 });
  }
}
