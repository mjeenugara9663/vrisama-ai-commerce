export function slugify(value) {
  return String(value || "").toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 45).replace(/-$/g, "");
}
export function validSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 45 && value.length >= 3;
}
export function cleanText(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}
export function isHttpImage(value) {
  if (!value) return true;
  try { const u = new URL(value); return u.protocol === "https:"; }
  catch { return false; }
}
export function planLimit(plan) {
  return ({ trial: 10, starter: 50, business: 300, growth: 1000 })[plan] ?? 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Mirrors public.org_entitled() in supabase/migrations/002_hardening.sql.
 * A workspace is entitled while its trial is running, while a subscription is active/authenticated,
 * or until the paid period ends after a cancellation.
 */
export function isEntitled(sub, now = new Date()) {
  if (!sub) return false;
  const ms = (v) => (v ? new Date(v).getTime() : Number.NaN);
  const t = now.getTime();
  if (sub.status === "trialing") return ms(sub.trial_ends_at) > t;
  if (sub.status === "active" || sub.status === "authenticated") return true;
  if (sub.status === "cancelled") return ms(sub.current_period_end) > t;
  return false;
}

/** Operator automation (n8n) is a paid-plan feature: Business and Growth, not during trial. */
export function hasAutomation(sub, now = new Date()) {
  return !!sub && sub.status !== "trialing" && isEntitled(sub, now) && (sub.plan === "business" || sub.plan === "growth");
}

const EVENT_STATUS = {
  "subscription.authenticated": "authenticated",
  "subscription.activated": "active",
  "subscription.charged": "active",
  "subscription.pending": "pending",
  "subscription.paused": "paused",
  "subscription.halted": "halted",
  "subscription.cancelled": "cancelled",
  "subscription.completed": "completed",
  "subscription.resumed": "active",
};
const SETTABLE = new Set(["authenticated", "active", "pending", "halted", "paused", "cancelled", "completed"]);
/** Maps a Razorpay webhook event (and entity status for `subscription.updated`) to our status, or null to ignore. */
export function billingStatusFor(eventName, entityStatus) {
  if (eventName === "subscription.updated") return SETTABLE.has(entityStatus) ? entityStatus : null;
  return EVENT_STATUS[eventName] ?? null;
}

/** Only same-site absolute paths; blocks open redirects such as //evil.com or /\evil.com. */
export function safeNextPath(value, fallback = "/dashboard") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}

/** Best-effort client IP from proxy headers. Only trust these behind a proxy you control (Vercel, Azure, Cloudflare). */
export function clientIp(headers) {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64) || "unknown";
  return (headers.get("x-real-ip") || "unknown").slice(0, 64);
}
