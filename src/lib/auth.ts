import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";

export type Role = "viewer" | "editor" | "owner";
const ranks: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

/** Thrown by API helpers; route handlers convert it to a 401/403 JSON response. */
export class AuthError extends Error {
  constructor(public status: 401 | 403) { super(status === 401 ? "Sign in required" : "Not authorized for this workspace"); }
}

/** Server components and server actions: redirects to /login when signed out. */
export async function requireUser() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) redirect("/login");
  return { db, user };
}

/** Server components and server actions. Non-members get a 404 (never confirms the workspace exists). */
export async function requireOrg(orgId: string, minRole: Role = "viewer") {
  const { db, user } = await requireUser();
  if (!isUuid(orgId)) notFound();
  const { data: membership } = await db.from("org_members")
    .select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  if (!membership) notFound();
  const role = membership.role as Role;
  if (ranks[role] < ranks[minRole]) redirect(`/dashboard/${orgId}?error=forbidden`);
  return { db, user, role };
}

/** Route handlers: never redirects; throws AuthError(401 | 403). */
export async function requireOrgForApi(orgId: string, minRole: Role = "viewer") {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new AuthError(401);
  if (!isUuid(orgId)) throw new AuthError(403);
  const { data: membership } = await db.from("org_members")
    .select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  if (!membership || ranks[membership.role as Role] < ranks[minRole]) throw new AuthError(403);
  return { db, user, role: membership.role as Role };
}
