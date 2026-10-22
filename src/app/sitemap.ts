import type { MetadataRoute } from "next";
import { publicClient } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let base = "";
  try { base = new URL(process.env.APP_URL ?? "").origin; } catch { return []; }
  const db = publicClient();
  const entries: MetadataRoute.Sitemap = [{ url: base, changeFrequency: "weekly", priority: 1 }];
  // Row-level security already limits this to published storefronts of workspaces with an active trial/subscription.
  for (let from = 0; from < 10000; from += 1000) {
    const { data, error } = await db.from("sites").select("slug,created_at").eq("published", true).order("created_at").range(from, from + 999);
    if (error || !data?.length) break;
    entries.push(...data.map(s => ({ url: `${base}/s/${s.slug}`, lastModified: new Date(s.created_at), changeFrequency: "weekly" as const, priority: 0.7 })));
    if (data.length < 1000) break;
  }
  return entries;
}
