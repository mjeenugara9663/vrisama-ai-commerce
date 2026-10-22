import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { verifyHexSignature } from "@/lib/security";
import { billingStatusFor } from "@/lib/utils";

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  const body = await request.text();
  if (body.length > 100000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  if (!verifyHexSignature(body, secret, request.headers.get("x-razorpay-signature")))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  try {
    const event = JSON.parse(body);
    const eventId = request.headers.get("x-razorpay-event-id");
    if (!eventId || eventId.length > 200) return NextResponse.json({ error: "Missing unique event ID" }, { status: 400 });
    const entity = event.payload?.subscription?.entity;
    const status = billingStatusFor(String(event.event || ""), String(entity?.status || ""));
    if (!status) return NextResponse.json({ received: true, ignored: true });
    if (typeof entity?.id !== "string") return NextResponse.json({ error: "Missing subscription ID" }, { status: 400 });

    const periodEnd = Number(entity.current_end);
    const periodISO = Number.isFinite(periodEnd) && periodEnd > 0 ? new Date(periodEnd * 1000).toISOString() : null;
    const createdAt = Number(event.created_at);
    const eventAt = Number.isFinite(createdAt) && createdAt > 0 ? new Date(createdAt * 1000) : new Date();

    const { data, error } = await adminClient().rpc("apply_billing_event", {
      p_event_id: eventId, p_subscription_id: entity.id, p_event_type: String(event.event),
      p_status: status, p_period_end: periodISO, p_event_at: eventAt.toISOString(),
    });
    if (error) { console.error("billing webhook rpc failed", error.message); return NextResponse.json({ error: "Failed to process billing event" }, { status: 500 }); }

    if (data === "unknown") {
      console.error("billing webhook for unknown subscription (reconcile manually)", entity.id, event.event);
      // Recent events: ask Razorpay to retry (we may have been called before our own write committed).
      // Old events / subscriptions created outside this app: acknowledge so Razorpay does not disable the webhook.
      if (Date.now() - eventAt.getTime() < 10 * 60 * 1000) return NextResponse.json({ error: "Subscription not yet recorded" }, { status: 409 });
      return NextResponse.json({ received: true, unknown: true });
    }
    return NextResponse.json({ received: true, result: data });
  } catch { return NextResponse.json({ error: "Invalid event payload" }, { status: 400 }); }
}
