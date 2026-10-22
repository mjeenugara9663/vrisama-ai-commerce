import "server-only";

export type RazorpaySubscription = { id: string; status: string; plan_id?: string; short_url?: string };

function authHeader() {
  const key = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) return null;
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}
export const razorpayConfigured = () => authHeader() !== null;

async function call(path: string, init: { method: "GET" | "POST"; body?: unknown }) {
  const authorization = authHeader();
  if (!authorization) throw new Error("razorpay_not_configured");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: init.method,
    headers: { authorization, "content-type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  return res;
}

export async function getSubscription(id: string): Promise<RazorpaySubscription | null> {
  const res = await call(`/subscriptions/${encodeURIComponent(id)}`, { method: "GET" });
  if (!res.ok) return null;
  const json = await res.json();
  return typeof json?.id === "string" ? json : null;
}
export async function cancelSubscription(id: string): Promise<boolean> {
  const res = await call(`/subscriptions/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { cancel_at_cycle_end: 0 } });
  return res.ok;
}
export async function createSubscription(body: Record<string, unknown>): Promise<RazorpaySubscription | null> {
  const res = await call("/subscriptions", { method: "POST", body });
  if (!res.ok) return null;
  const json = await res.json();
  return typeof json?.id === "string" ? json : null;
}
