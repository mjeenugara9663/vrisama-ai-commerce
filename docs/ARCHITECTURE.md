# Vrisama AI Commerce — design and threat model

## Scope and architecture

- **Web and API**: Next.js 16 App Router with server actions and route handlers.
- **Identity**: Supabase Auth, secure cookie sessions, server `getUser()`, optional email confirmation.
- **Tenancy**: `organizations.id` is the sole tenant identifier. Membership and roles are in `org_members`. Every operational record holds `org_id`.
- **Defense in depth**: Row-level security on all database tables, explicit table grants, verified membership in server mutations, and service-role-only routes for public lead ingestion and billing webhooks.
- **Website**: Configurable catalog-style storefront under `/s/<slug>`; `published=false` prevents anonymous access. This MVP is not a full drag-and-drop or AI page generator.
- **Lead capture**: Public form -> validated API -> server-only Supabase service role -> leads table. Production submission requires Cloudflare Turnstile.
- **AI**: Authenticated editor -> atomic monthly credit allocation -> HTTPS OpenAI-compatible model -> saved `marketing_drafts` record. Never publishes externally.
- **Automation**: Optional Vrisama-operated n8n webhook receives signed *non-PII* event notifications (org ID + lead ID). Operator-owned workflow fetches authorized data through a separate secure service integration developed later. Customers cannot view or edit workflows.
- **Billing**: Razorpay subscriptions created by owner, provider id stored server-side; HMAC-verified webhook updates current plan status idempotently by unique event ID. Use TEST credentials before production.

```text
       ┌────────────────────────────────────────────────┐
       │                 Next.js SaaS                    │
       │  Sign-up / Workspaces / Catalog / Lead inbox   │
       │  AI Drafts / Billing / Public Storefronts      │
       └────────────────────────┬───────────────────────┘
                                │ authenticated SSR
          ┌─────────────────────┴────────────────────┐
          ▼                                          ▼
    Supabase Auth                                 Server APIs
          │                                          │
  Organization memberships                    ┌──────┼─────────┐
          │                                   │      │         │
          ▼                                   ▼      ▼         ▼
   PostgreSQL + RLS                          AI   Razorpay     n8n
 (tenanted operational data)               provider webhooks  internal
```

## What is implemented vs. deferred

### Implemented in starter code
- Multi-workspace owner onboarding, identity and RBAC read/write checks.
- Secure schema for owner/editor/viewer, RLS policies, public/private storefront isolation.
- Storefront editing and publishing; catalog creation; public inquiry capture; lead inbox updates.
- Marketing draft generation with API secrets on the server; atomic request quotas.
- Razorpay subscription creation, webhook signature verification and event de-duplication path.
- Optional internal signed n8n event notifications.

- Password reset, product hide/show/delete, plan-based entitlements enforced in RLS, per-IP/per-storefront/per-user durable rate limits, AI credit refunds on provider failure, out-of-order and replay-safe billing events, recovery from abandoned checkouts, CSP and security headers, SQL isolation test suite.

### Not implemented / launch blockers
- Actual payments have NOT been processed and integrations have NOT been live-tested.
- Email invitation/team-member management UI and SSO. (Roles exist in the schema; add members via SQL for pilots.)
- Terms of Service, Privacy Policy and cookie/consent pages — you must supply counsel-reviewed text. The lead form shows a short contact-consent line but consent is not stored.
- Interactive AI website generation, order checkout, shopping cart, tax invoices, shipping and inventory.
- Automatic Meta/Facebook/Instagram ad publishing or spending and user-controlled social scheduling.
- Robust service-provider reconciliation for stuck payment sessions, refunds and failures.
- Consent records, data-subject-request workflows and data retention jobs; WAF/bot rules beyond Turnstile and the built-in rate limits.
- Customer custom domains, platform-managed domain DNS, image uploads, marketing contact consent.
- Automated UI/integration tests and penetration testing; deployment observability and DR exercises.

## Security model

1. **Never pass service-role keys to clients**. `adminClient()` is imported only in trusted route handlers.
2. **Do not rely on client-provided org IDs**: secure mutations use verified sessions + RLS. Public inquiry path resolves `org_id` from the server-verified published site.
3. **Keep n8n internal**. For SaaS products that expose customer workflow configuration, assess n8n Enterprise/commercial licensing before launch.
4. **No automated AI publishing**: output is stored in an unapproved draft.
5. **Billing trusts signed webhooks, not browser return values.** Events are de-duplicated by event ID, ordered by the provider's event timestamp (older events can never overwrite newer state), and replaced/abandoned provider subscriptions are retired so late events for them are acknowledged and ignored. Still run provider-side reconciliation before sales.
6. **Secret handling**: publishable Supabase key is public; service role, model, n8n and payment secrets must never be `NEXT_PUBLIC_*`.
7. **Public lead submission**: TURNSTILE_SECRET_KEY is mandatory in production. Optional policy should include consent/privacy disclosure and data deletion.
8. **User roles**: owner handles billing, editors modify content and leads, viewers can only read allowed data.
9. **Monthly AI quotas**: PostgreSQL RPC prevents concurrent overspend within an organization; a credit is refunded automatically when the provider call fails or the draft cannot be saved.
10. **Website content** is rendered as text, not raw HTML; hosted image URLs must be HTTPS.

## Suggested launch phases

- **Pilot 1 (1–3 businesses)**: Tenant-isolation testing; Turnstile, Supabase Auth, published URLs, Razorpay test billing, consent and backup.
- **Paid beta**: Provider reconciliation, team invites, password reset, payment receipts, monitoring, rate limits and customer support flows.
- **V2**: Templates, page builder, stock, checkout, ad scheduling with approvals and supported Meta APIs, custom domains and observability.

## SaaS cost model

Track fixed costs (hosting, database, observability) and variable costs per tenant (tokens, messages, media, payment fees). Enforce AI token caps separately from API-call caps for predictable gross margin. Do not advertise unlimited automation until unit economics and abuse controls are established.

## n8n licensing

The n8n Sustainable Use License can permit operator-owned workflows delivered as services to customers while clients cannot edit workflows. Giving customers self-service workflow editing through API/UI/agent generally requires a commercial license. See https://support.n8n.io/article/can-i-use-your-license-for-my-use-case and obtain confirmation for the actual SaaS model.
