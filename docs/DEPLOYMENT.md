# Deployment guide (pilot; not yet launch approved)

## First installation

1. Create a **new** Supabase project for the pilot. Apply `supabase/migrations/001_initial.sql` then `002_hardening.sql`, then `003_search_insights.sql` (each as a single migration), inspect logs, and create two non-admin test accounts.
2. Configure Supabase Auth production `Site URL` and email confirmation `Redirect URL`: `https://YOUR_DOMAIN/auth/callback`.
3. Choose a Next.js Node runtime provider (e.g. Azure App Service for Node 22, Vercel or equivalent). Configure runtime and build environment variables, including both `NEXT_PUBLIC_` Supabase credentials; never expose service-role, AI or Razorpay keys.
4. Set `APP_URL=https://YOUR_DOMAIN`; configure HTTPS/TLS, platform logging, secret rotation and domain restrictions.
5. Provision Cloudflare Turnstile on your production domain and set both client/server Turnstile keys; without the server key production contact forms intentionally refuse requests.
6. Configure AI credentials if providing that feature. Use dedicated model API budgets per environment.
7. Configure Razorpay **test mode** plans matching UI (Starter ₹999, Business ₹2,499, Growth ₹5,999; monthly). Add TEST webhook to `https://YOUR_DOMAIN/api/billing/webhook` and record its separately configured webhook secret.
8. Validate subscription creation, payment authentication, activation, renewal, cancellation, webhook duplicate delivery, and stale events. Configure reconciliation and support escalation before switching to LIVE plans.
9. If integrating n8n, store the webhook URL and its shared secret on the server. Verify signed payloads on the receiving workflow endpoint; do not expose the workflow editor to customers.
10. Verify two-user / two-workspace data isolation, outbound emails, redirect flows, usage quotas, lead spam protection, observability, backup/restore, service outage handling and Indian legal/privacy requirements.

## Operational controls

- **Monitor** errors in all Next.js routes, Supabase Auth/DB API, billing webhook delivery, message and model-provider costs.
- **Backups**: define a Supabase PITR/recovery policy appropriate to paid customers and rehearse restores.
- **Safe deployment**: run tests and review SQL migrations in a staging environment; never update the live schema manually without versioned migrations.
- **Release gates**: retain a documented review checklist for tenant isolation, payment charging, email/privacy compliance, anti-abuse, customer support and refund policy.
- **Costs**: implement durable rate limiting and cost alerts before scaling publicly.

## Verification status

Search features: the storefront page, search logging, metadata, sitemap, robots and cron auth were exercised against a stubbed Supabase REST API; the Google Search Console client was tested against a mocked Google (JWT signature, paging, aggregation). It has **not** been run against a real Google property — follow `docs/SEARCH_INSIGHTS.md` and check the first sync's JSON response.

Verified in CI-equivalent runs: `npm run lint`, `npm run typecheck`, `npm test` (unit), `npm run build`, `npm run test:sql` (81 assertions on PostgreSQL 16 with a mocked Supabase `auth` schema), and HTTP smoke tests of the production server (security headers, 401/400/413 handling, webhook signature checks, open-redirect guard).

**Not verified (needs your accounts):** real Supabase Auth emails and redirects, Razorpay test-mode checkout/activation/renewal/cancellation, Cloudflare Turnstile on your domain, and the AI provider. In particular confirm in Razorpay test mode that cancelling an unpaid (`created`) subscription via API succeeds, since the "switch plan before paying" path depends on it.

The ZIP contains `package-lock.json`; use `npm ci` in CI. It deliberately contains no `.env.local` or credentials.

## Hosting notes

- Rate limiting uses the first `x-forwarded-for` hop. Deploy behind a platform that sets it (Vercel, Azure App Service, Cloudflare); if you expose Node directly, clients can spoof it.
- The Content-Security-Policy lives in `next.config.ts`. Add origins deliberately if you add analytics, chat widgets or a custom Supabase domain (the Supabase origin is derived from `NEXT_PUBLIC_SUPABASE_URL`).
- Razorpay webhook: subscribe to `subscription.authenticated`, `activated`, `charged`, `pending`, `halted`, `paused`, `resumed`, `cancelled`, `completed`, `updated`.
