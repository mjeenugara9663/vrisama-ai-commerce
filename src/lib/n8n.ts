import "server-only";
import { createHmac } from "node:crypto";
export async function dispatchEvent(orgId: string, type: string, payload: Record<string, unknown>) {
  const url = process.env.N8N_WEBHOOK_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!url || !secret) return { dispatched: false, reason: "not_configured" };
  const body = JSON.stringify({ orgId, type, payload, timestamp: new Date().toISOString() });
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-vrisama-signature": signature }, body, signal: AbortSignal.timeout(6000) });
    return { dispatched: response.ok };
  } catch { return { dispatched: false }; }
}
