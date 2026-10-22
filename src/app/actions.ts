"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg, requireUser } from "@/lib/auth";
import { cleanText, isHttpImage, isUuid, slugify, validSlug } from "@/lib/utils";

export async function createWorkspace(form: FormData) {
  const { db } = await requireUser();
  const name = cleanText(form.get("name"), 100);
  const slug = slugify(form.get("slug") || name);
  if (name.length < 2 || !validSlug(slug)) redirect("/dashboard?error=invalid-workspace");
  const { data, error } = await db.rpc("create_organization", { p_name: name, p_slug: slug });
  if (error || !data) redirect("/dashboard?error=workspace-name-taken-or-limit");
  revalidatePath("/dashboard");
  redirect(`/dashboard/${data}`);
}

export async function createProduct(form: FormData) {
  const orgId = String(form.get("org_id") || "");
  const { db } = await requireOrg(orgId, "editor");
  const name = cleanText(form.get("name"), 100);
  const description = cleanText(form.get("description"), 1000);
  const image_url = cleanText(form.get("image_url"), 1000);
  const amount = Number(form.get("price_inr"));
  if (name.length < 2 || !Number.isFinite(amount) || amount < 0 || amount > 999999999 || !isHttpImage(image_url))
    redirect(`/dashboard/${orgId}?error=invalid-product`);
  const { error } = await db.from("products").insert({ org_id: orgId, name, description, price_inr: amount, image_url: image_url || null });
  if (error) redirect(`/dashboard/${orgId}?error=${/limit/i.test(error.message) ? "product-limit" : "product-save-failed"}`);
  revalidatePath(`/dashboard/${orgId}`);
  redirect(`/dashboard/${orgId}#products`);
}

export async function updateSite(form: FormData) {
  const orgId = String(form.get("org_id") || "");
  const { db } = await requireOrg(orgId, "editor");
  const title = cleanText(form.get("title"), 100);
  const tagline = cleanText(form.get("tagline"), 260);
  const accent = String(form.get("accent") || "#56E0CF");
  const published = form.get("published") === "on";
  if (title.length < 2 || !/^#[0-9a-fA-F]{6}$/.test(accent)) redirect(`/dashboard/${orgId}?error=invalid-site`);
  const { data: updated, error } = await db.from("sites").update({ title, tagline, accent, published }).eq("org_id", orgId).select("id");
  if (error || !updated?.length) redirect(`/dashboard/${orgId}?error=site-update-failed`);
  revalidatePath(`/dashboard/${orgId}`);
  redirect(`/dashboard/${orgId}#storefront`);
}

export async function updateLeadStatus(form: FormData) {
  const orgId = String(form.get("org_id") || "");
  const { db } = await requireOrg(orgId, "editor");
  const leadId = String(form.get("lead_id") || "");
  const status = String(form.get("status") || "");
  if (!['new','contacted','qualified','closed'].includes(status) || !isUuid(leadId)) return;
  await db.from("leads").update({ status }).eq("id", leadId).eq("org_id", orgId);
  revalidatePath(`/dashboard/${orgId}`);
}

export async function setProductActive(form: FormData) {
  const orgId = String(form.get("org_id") || "");
  const { db } = await requireOrg(orgId, "editor");
  const productId = String(form.get("product_id") || "");
  if (!isUuid(productId)) return;
  await db.from("products").update({ is_active: form.get("active") === "true" }).eq("id", productId).eq("org_id", orgId);
  revalidatePath(`/dashboard/${orgId}`);
}

export async function deleteProduct(form: FormData) {
  const orgId = String(form.get("org_id") || "");
  const { db } = await requireOrg(orgId, "editor");
  const productId = String(form.get("product_id") || "");
  if (!isUuid(productId)) return;
  await db.from("products").delete().eq("id", productId).eq("org_id", orgId);
  revalidatePath(`/dashboard/${orgId}`);
}

export async function signOut() {
  const { db } = await requireUser();
  await db.auth.signOut();
  redirect("/");
}
