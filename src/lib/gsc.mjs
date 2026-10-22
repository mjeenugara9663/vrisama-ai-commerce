// Google Search Console client using a Google service account (no SDK dependency).
// Setup: create a service account, add its email as a user (Restricted) on your Search Console property,
// and set GSC_SITE_URL + GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_KEY. See docs/SEARCH_INSIGHTS.md.
import { createSign } from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

/** Builds the RS256-signed JWT assertion Google expects for service-account auth. */
export function signServiceAccountJwt({ email, privateKey, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const header = b64url({ alg: "RS256", typ: "JWT" });
  const claims = b64url({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3300 });
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(privateKey.replace(/\\n/g, "\n")).toString("base64url");
  return `${header}.${claims}.${signature}`;
}

export async function getAccessToken({ email, privateKey, fetchImpl = fetch }) {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signServiceAccountJwt({ email, privateKey }) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`google_token_${res.status}`);
  const json = await res.json();
  if (typeof json.access_token !== "string") throw new Error("google_token_missing");
  return json.access_token;
}

const ymd = (d) => d.toISOString().slice(0, 10);
/** Search Console data lags ~2-3 days; use the last 28 complete days ending 3 days ago. */
export function defaultDateRange(now = new Date()) {
  const end = new Date(now.getTime() - 3 * 86400000);
  const start = new Date(end.getTime() - 27 * 86400000);
  return { startDate: ymd(start), endDate: ymd(end) };
}

/** Fetches (page, query) rows for every URL containing `/s/`, paginating up to 4 x 25,000 rows. */
export async function fetchSearchRows({ siteUrl, token, startDate, endDate, fetchImpl = fetch, rowLimit = 25000, maxPages = 4 }) {
  const rows = [];
  for (let page = 0; page < maxPages; page++) {
    const res = await fetchImpl(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        startDate, endDate, dimensions: ["page", "query"], rowLimit, startRow: page * rowLimit, dataState: "final",
        dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "contains", expression: "/s/" }] }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`gsc_query_${res.status}`);
    const json = await res.json();
    const batch = Array.isArray(json.rows) ? json.rows : [];
    rows.push(...batch);
    if (batch.length < rowLimit) break;
  }
  return rows;
}

/**
 * Groups raw rows by storefront slug (from the page URL path /s/<slug>) and merges URL variants of the same page.
 * Position is impression-weighted. Returns Map<slug, Array<{query, clicks, impressions, ctr, position}>> (top `limit` by impressions).
 */
export function aggregateBySlug(rows, limit = 100) {
  const bySlug = new Map();
  for (const r of rows) {
    const [page, query] = r.keys ?? [];
    if (typeof page !== "string" || typeof query !== "string" || !query) continue;
    let path;
    try { path = new URL(page).pathname; } catch { continue; }
    const m = path.match(/^\/s\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
    if (!m) continue;
    const slug = m[1];
    const queries = bySlug.get(slug) ?? new Map();
    const cur = queries.get(query) ?? { query, clicks: 0, impressions: 0, posWeighted: 0 };
    cur.clicks += Number(r.clicks) || 0;
    cur.impressions += Number(r.impressions) || 0;
    cur.posWeighted += (Number(r.position) || 0) * (Number(r.impressions) || 0);
    queries.set(query, cur);
    bySlug.set(slug, queries);
  }
  const result = new Map();
  for (const [slug, queries] of bySlug) {
    result.set(slug, [...queries.values()]
      .map(q => ({
        query: q.query, clicks: q.clicks, impressions: q.impressions,
        ctr: q.impressions ? q.clicks / q.impressions : 0,
        position: q.impressions ? Math.round((q.posWeighted / q.impressions) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
      .slice(0, limit));
  }
  return result;
}
