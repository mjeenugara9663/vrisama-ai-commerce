import "server-only";
import { createHash } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Durable fixed-window rate limit backed by Postgres (works across serverless instances).
 * Returns true when the request is allowed. Fails OPEN on infrastructure errors so a database blip
 * never blocks genuine customers; errors are logged for alerting.
 */
export async function allow(scope: string, id: string, limit: number, windowSeconds: number): Promise<boolean> {
  const digest = createHash("sha256").update(`${process.env.RATE_LIMIT_SALT ?? ""}|${id}`).digest("hex").slice(0, 32);
  try {
    const { data, error } = await adminClient().rpc("hit_rate_limit", { p_key: `${scope}:${digest}`, p_limit: limit, p_window_seconds: windowSeconds });
    if (error) { console.error("rate-limit rpc failed", error.message); return true; }
    return data === true;
  } catch (e) { console.error("rate-limit unavailable", e instanceof Error ? e.message : e); return true; }
}
