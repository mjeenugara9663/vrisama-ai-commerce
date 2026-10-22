# Vrisama AI Commerce

A **downloadable, original multi-tenant SaaS starter** for business owners: managed storefronts, product catalog, lead inbox, AI marketing drafts, subscription integration, optional internal automations. Includes password reset, product management, plan-based entitlements, durable rate limiting and a tested billing/tenant-isolation layer. It has **not** been run against live Supabase, Razorpay or Turnstile accounts — complete the pilot checklist in `docs/DEPLOYMENT.md` before charging customers.

## Quick start

**Requirements:** Node.js 20.9+, npm, a new Supabase project, and a Supabase Auth email provider.

1. In Supabase, create a project and run `supabase/migrations/001_initial.sql`, then `002_hardening.sql`, then `003_search_insights.sql` in the SQL Editor (in that order, each as a whole). Confirm both succeed. Do not run it on a production database without reviewing policies and backups.
2. In Supabase Auth → URL Configuration, set `Site URL` to `http://localhost:3000` and include `http://localhost:3000/auth/callback` in allowed Redirect URLs. Decide whether to require email confirmation.
3. Copy the environment template:

   ```bash
   cp .env.example .env.local
   ```

4. Populate Supabase URL, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY` from your project's API settings.
5. Start the app:

   ```bash
   npm install
   npm run dev
   ```

6. Set `RATE_LIMIT_SALT` to a random value (`openssl rand -hex 32`). Open `http://localhost:3000`, create an account, open `/dashboard`, create a business workspace, add products and publish its storefront. The public store URL is `/s/<business-slug>`.
7. Optional: configure `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` for AI marketing drafts. For a local OpenAI-compatible inference server, set `AI_BASE_URL=http://localhost:11434/v1` (only allowed in development).
8. For public production leads, set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` and register your production domain with Cloudflare Turnstile. By design production lead submissions return 503 until set.
9. For billing, configure Razorpay API credentials, three monthly **plan IDs**, a webhook secret, and the endpoint `https://YOUR_DOMAIN/api/billing/webhook`. **Always test in Razorpay test mode first**. A subscription can be started from the dashboard after configuration; activation is trusted only after the provider's signed webhook.
10. For optional operator-run n8n events, set `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET`, then verify the HMAC-SHA256 hex value sent as `x-vrisama-signature` over the *raw body*. Never expose customers to the n8n editor/API unless commercially licensed for that use.

## Commands

```bash
npm run dev      # development server
npm run build    # production build (requires dependencies and environment)
npm run lint     # lint project
npm run typecheck # TypeScript
npm test         # unit tests (Node built-in runner, no network)
npm run test:sql -- -h localhost -U postgres   # tenant-isolation + billing SQL tests on a THROWAWAY local Postgres (see tests/sql/run.sh)
npm run check    # lint + typecheck + unit tests + build (what CI runs)
```

## Database and routes

| Feature | Route / table |
|---|---|
| Auth | `/login`, `/auth/callback`, Supabase Auth |
| Workspace creation & switching | `/dashboard`, `organizations`, `org_members` |
| Business dashboard | `/dashboard/[orgId]` |
| Catalog | `products` |
| Storefront | `/s/[slug]`, `sites` |
| Lead intake | `/api/leads`, `leads` |
| AI copy draft | `/api/ai/draft`, `marketing_drafts`, `usage_counters` |
| Billing | `/api/billing/create`, `/api/billing/webhook`, `subscriptions` |
| Storefront search, SEO, search insights | `/s/[slug]?q=`, `/sitemap.xml`, `/robots.txt`, `/api/cron/search-sync`, `store_searches`, `search_queries` — see `docs/SEARCH_INSIGHTS.md` |
| Password reset | `/login` (Forgot password) → `/auth/callback` → `/auth/reset` |
| Plan enforcement | `org_entitled()` (SQL, RLS) mirrored by `isEntitled()` in `src/lib/utils.mjs` |
| Rate limits | `rate_limits`, `hit_rate_limit()` (Postgres, durable across serverless instances) |
| Health check | `/api/health` |

## What plans enforce

| | Trial (14 days) | Starter | Business | Growth |
|---|---|---|---|---|
| Storefront publicly visible | yes | yes | yes | yes |
| AI drafts / month | 10 | 50 | 300 | 1,000 |
| n8n automation events | no | no | yes | yes |

When a trial ends without a paid subscription (or a subscription is halted/paused/expired), the public storefront and catalog are hidden by the database itself, lead intake stops, and AI is paused. Owners keep full dashboard access and data. A cancelled subscription stays active until its paid period ends. Change the policy in `002_hardening.sql` (`org_entitled`) **and** `isEntitled` in `src/lib/utils.mjs` together.

## Security testing before a paying customer

The SQL suite (`npm run test:sql`) already proves, on real PostgreSQL, that workspace B cannot read or modify workspace A's data, that viewers cannot write, that clients cannot call billing/rate-limit functions or write billing tables, and that webhook replay/out-of-order/stale events cannot corrupt subscription state. You must still repeat the checks below against your real Supabase project, because Supabase's real `auth` schema and API layer are not part of that local test.


Manual end-to-end pass: create two Supabase users, A and B. Under A create business A, under B create business B. Verify B cannot read/write A's unpublished site, products, leads, drafts or subscription. Verify B cannot mutate A's records with guessed UUIDs by calling the APIs directly. Test the public catalog before and after publish. Test Turnstile on real production domain. Replay signed Razorpay webhook events and reject bad signatures. See `docs/ARCHITECTURE.md` for the complete release checklist.

## Important limitations

- You **must** supply Supabase / AI / billing keys; no credentials are included.
- Draft-only AI is intentional; no publishing, ad purchases or WhatsApp outreach without explicit authorization / consent controls.
- Public sites are **catalog/inquiry sites**, not a full shopping cart or AI drag-and-drop designer.
- n8n is an **optional internal operator-owned integration**; customer-configurable workflow builders may require an n8n commercial license.
- Subscription pricing in UI is illustrative; ensure Razorpay plans exactly match the displayed prices and billing cadence before launch.
- Check local Indian tax, privacy and consumer-compliance requirements with appropriate experts before selling subscriptions.

This code is originally written for Vrisama. It does not reuse Alippo code, protected branding, or UI assets.
