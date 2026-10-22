# Changelog

## 0.3.0 — search insights
- **Storefront search** with ranked, plural/partial-tolerant matching; empty results show a prefilled "tell us what you need" lead form.
- **Search-driven leads:** leads record the term that led to them (`search_term`, `source = storefront-search`) and show it in the inbox.
- **Anonymous demand analytics:** top searches and no-result searches per workspace (no IPs; PII-looking terms and bots never logged; 90-day retention).
- **Google Search Console sync** (service account, daily job) showing the real Google queries that reach each storefront.
- **SEO:** per-store metadata, canonical URLs, Open Graph, JSON-LD, `sitemap.xml`, `robots.txt`; search pages are `noindex`.
- New migration `003_search_insights.sql`; 17 unit tests and 81 SQL assertions.

## 0.2.0 — hardening release
- **Fixed:** production build failed type-checking (`@supabase/ssr` 0.6 → 0.12); lint errors; `redirect()` swallowed inside API `try/catch` (now proper 401/403); non-members now get 404.
- **Billing:** abandoned checkouts no longer lock a workspace (resume, or cancel-and-replace); webhook events are ordered by provider timestamp and replaced subscriptions are retired; `subscription.pending/updated` handled; unknown-subscription webhooks no longer risk Razorpay disabling the endpoint.
- **Plans:** trial/subscription lapse now hides the public storefront and stops lead intake and AI; n8n automation limited to paid Business/Growth plans.
- **Abuse protection:** durable Postgres rate limits (per IP, per storefront, per user), real byte cap on lead bodies, Turnstile `remoteip`, 500-product cap, AI credits refunded on provider failure.
- **Features:** password reset, product hide/show/delete, lapsed-plan banner, lead consent notice.
- **Security:** CSP, HSTS, frame/nosniff/referrer/permissions headers; `APP_URL`-based callback redirects; `next` redirect allow-listing.
- **Tests/CI:** 11 unit tests, 60-assertion PostgreSQL isolation/billing suite, GitHub Actions workflow, committed lockfile.
- New migration: `supabase/migrations/002_hardening.sql` (apply after 001).

## 0.1.0
Initial starter.
