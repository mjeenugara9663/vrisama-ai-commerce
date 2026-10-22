import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { aggregateBySlug, defaultDateRange, fetchSearchRows, getAccessToken, gscConfig } from "@/lib/gsc";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const digest = (v: string) => createHash("sha256").update(v).digest();

/**
 * Daily job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; any scheduler can do the same).
 * 1) Pulls Google Search Console queries for all /s/<slug> pages in ONE API call sequence,
 * 2) stores the top queries per storefront, 3) prunes old on-site search logs.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  const supplied = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(digest(supplied), digest(secret))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = adminClient();
  const { data: pruned } = await db.rpc("prune_search_data");

  const cfg = gscConfig();
  if (!cfg) return NextResponse.json({ ok: true, pruned, gsc: "not_configured" });

  try {
    const token = await getAccessToken({ email: cfg.email, privateKey: cfg.privateKey });
    const range = defaultDateRange();
    const rows = await fetchSearchRows({ siteUrl: cfg.siteUrl, token, ...range });
    const bySlug = aggregateBySlug(rows);

    const { data: sites, error } = await db.from("sites").select("slug,org_id").eq("published", true);
    if (error) throw new Error("sites_query_failed");
    let updated = 0, withData = 0;
    for (const s of sites ?? []) {
      const list = bySlug.get(s.slug) ?? [];
      if (list.length) withData++;
      const { error: rpcError } = await db.rpc("replace_search_queries", { p_org: s.org_id, p_rows: list, p_start: range.startDate, p_end: range.endDate });
      if (rpcError) console.error("replace_search_queries failed", s.slug, rpcError.message); else updated++;
    }
    return NextResponse.json({ ok: true, pruned, gsc: "synced", rows: rows.length, storefronts: sites?.length ?? 0, withData, updated, ...range });
  } catch (e) {
    console.error("search sync failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, pruned, error: "search_sync_failed" }, { status: 502 });
  }
}
