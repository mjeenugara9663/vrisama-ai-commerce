import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** One storefront + its active products per request (shared by generateMetadata and the page). RLS enforces published + entitled. */
export const getStore = cache(async (slug: string) => {
  const db = await createClient();
  const { data: site } = await db.from("sites").select("id,org_id,title,tagline,accent,slug,published").eq("slug", slug).eq("published", true).maybeSingle();
  if (!site) return null;
  const { data: products } = await db.from("products").select("id,name,description,price_inr,image_url")
    .eq("org_id", site.org_id).eq("is_active", true).order("created_at", { ascending: false }).limit(100);
  return { site, products: products ?? [] };
});
