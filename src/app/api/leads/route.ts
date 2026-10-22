import { after, NextResponse } from "next/server";
import { z } from "zod";
import { readLimitedText } from "@/lib/api";
import { dispatchEvent } from "@/lib/n8n";
import { allow } from "@/lib/ratelimit";
import { adminClient } from "@/lib/supabase/admin";
import { clientIp, hasAutomation, isEntitled } from "@/lib/utils";

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,45}$/),
  name: z.string().trim().min(2).max(100),
  email: z.union([z.email().max(254), z.literal("")]),
  phone: z.string().trim().max(25),
  message: z.string().trim().max(1000),
  searchTerm: z.string().trim().max(80).optional().default(""),
  company: z.string().max(300).optional().default(""),
  captcha: z.string().max(4096).optional().default(""),
}).refine(v => !!v.email || !!v.phone, { message: "Provide a contact method" });

export async function POST(request: Request) {
  try {
    const ip = clientIp(request.headers);
    if (!(await allow("lead-ip", ip, 8, 600)))
      return NextResponse.json({ error: "Too many inquiries from your network. Please try again later." }, { status: 429 });

    const raw = await readLimitedText(request, 12000);
    if (raw === null) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
    const input = schema.safeParse(json);
    if (!input.success) return NextResponse.json({ error: "Provide a name, valid contact and optional message." }, { status: 400 });
    if (input.data.company) return NextResponse.json({ ok: true }); // honeypot: pretend success

    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (process.env.NODE_ENV === "production" && !secret)
      return NextResponse.json({ error: "Public lead capture is not yet enabled. Contact this business directly." }, { status: 503 });
    if (secret) {
      if (!input.data.captcha) return NextResponse.json({ error: "Complete the security challenge." }, { status: 400 });
      const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST", body: new URLSearchParams({ secret, response: input.data.captcha, ...(ip !== "unknown" ? { remoteip: ip } : {}) }),
        signal: AbortSignal.timeout(8000),
      });
      const result = await verify.json();
      if (!result.success) return NextResponse.json({ error: "Security verification failed." }, { status: 400 });
    }
    // Per-storefront cap protects one business's inbox from floods spread across many IPs.
    if (!(await allow("lead-site", input.data.slug, 60, 3600)))
      return NextResponse.json({ error: "This storefront is receiving many inquiries. Please try again later." }, { status: 429 });

    const db = adminClient();
    const { data: site, error: siteError } = await db.from("sites").select("id,org_id").eq("slug", input.data.slug).eq("published", true).maybeSingle();
    if (siteError || !site) return NextResponse.json({ error: "Storefront unavailable" }, { status: 404 });
    const { data: sub } = await db.from("subscriptions").select("plan,status,trial_ends_at,current_period_end").eq("org_id", site.org_id).maybeSingle();
    if (!isEntitled(sub)) return NextResponse.json({ error: "Storefront unavailable" }, { status: 404 });

    const lead = {
      org_id: site.org_id, site_id: site.id, visitor_name: input.data.name, visitor_email: input.data.email || null,
      visitor_phone: input.data.phone || null, message: input.data.message,
      source: input.data.searchTerm ? "storefront-search" : "storefront", search_term: input.data.searchTerm || null,
    };
    const { data: inserted, error } = await db.from("leads").insert(lead).select("id").single();
    if (error) return NextResponse.json({ error: "Unable to save inquiry" }, { status: 500 });

    // Runs after the response is sent: inbox delivery never waits on (or depends on) automation uptime.
    if (hasAutomation(sub)) after(async () => { await dispatchEvent(site.org_id, "lead.created", { leadId: inserted.id, source: input.data.searchTerm ? "storefront-search" : "storefront" }); });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch { return NextResponse.json({ error: "Unable to submit inquiry" }, { status: 500 }); }
}
