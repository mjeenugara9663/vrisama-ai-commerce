import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse } from "@/lib/api";
import { requireOrgForApi } from "@/lib/auth";
import { allow } from "@/lib/ratelimit";
import { cancelSubscription, createSubscription, getSubscription, razorpayConfigured } from "@/lib/razorpay";
import { adminClient } from "@/lib/supabase/admin";

const schema = z.object({ orgId: z.uuid(), plan: z.enum(["starter", "business", "growth"]) });
const httpsUrl = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);

export async function POST(req: Request) {
  try {
    let json: unknown;
    try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
    const parsed = schema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Invalid plan selection." }, { status: 400 });
    const { orgId, plan } = parsed.data;
    const { user } = await requireOrgForApi(orgId, "owner");
    if (!(await allow("billing", user.id, 6, 600))) return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });

    const planId = ({ starter: process.env.RAZORPAY_PLAN_STARTER, business: process.env.RAZORPAY_PLAN_BUSINESS, growth: process.env.RAZORPAY_PLAN_GROWTH })[plan];
    if (!razorpayConfigured() || !planId) return NextResponse.json({ error: "Billing is not configured for this plan." }, { status: 503 });

    const db = adminClient();
    const { data: current } = await db.from("subscriptions").select("plan,status,provider_subscription_id").eq("org_id", orgId).single();
    if (!current) return NextResponse.json({ error: "Workspace billing record unavailable." }, { status: 404 });
    if (current.status === "active") return NextResponse.json({ error: "An active subscription already exists. Use your Razorpay subscription link to manage it." }, { status: 409 });

    // An earlier checkout may have been abandoned. Look at the provider's truth instead of locking the customer out.
    if (current.provider_subscription_id) {
      const remote = await getSubscription(current.provider_subscription_id);
      if (!remote) return NextResponse.json({ error: "Could not check your earlier subscription with the payment provider. Please retry shortly." }, { status: 502 });
      if (["authenticated", "active", "pending", "halted", "paused"].includes(remote.status))
        return NextResponse.json({ error: "A subscription is already in progress for this workspace. If it was just paid, it activates within a few minutes; otherwise contact support." }, { status: 409 });
      if (remote.status === "created") {
        const url = httpsUrl(remote.short_url);
        if (url && current.plan === plan) return NextResponse.json({ subscriptionId: remote.id, checkoutUrl: url, resumed: true });
        // Different plan chosen: the unpaid authorization link must be cancelled first, otherwise it could still be paid later.
        if (!(await cancelSubscription(remote.id)))
          return NextResponse.json({ error: "Your earlier checkout link could not be replaced. Please retry, or contact support." }, { status: 502 });
      }
      // cancelled / completed / expired: safe to start a new subscription.
    }

    const created = await createSubscription({
      plan_id: planId, total_count: 120, quantity: 1, customer_notify: 1,
      notify_info: { notify_email: user.email },
      notes: { org_id: orgId, product: "vrisama-ai-commerce", plan },
    });
    if (!created) return NextResponse.json({ error: "The payment provider rejected the subscription request." }, { status: 502 });

    const { error } = await db.rpc("attach_subscription", { p_org: orgId, p_new: created.id, p_plan: plan });
    if (error) {
      console.error("attach_subscription failed", created.id, error.message);
      await cancelSubscription(created.id).catch(() => false);
      return NextResponse.json({ error: "Could not record the subscription. Nothing was charged; please retry." }, { status: 500 });
    }
    // Stays "trialing" until a verified webhook establishes payment status.
    return NextResponse.json({ subscriptionId: created.id, checkoutUrl: httpsUrl(created.short_url) });
  } catch (e) {
    return authErrorResponse(e) ?? NextResponse.json({ error: "Unable to start billing." }, { status: 500 });
  }
}
