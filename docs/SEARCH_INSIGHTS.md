# Search insights & search-driven lead generation

## What this does — and what it cannot do

| Source | What you get | Is it a "lead"? |
|---|---|---|
| **Storefront search box** (`/s/<slug>?q=…`) | Anonymous terms visitors typed, counts, and which returned **no results** | Not by itself. A visitor becomes a lead only by submitting the form. |
| **"Can't find it?" form** on empty results | A real lead, prefilled with what they searched for (`source = storefront-search`) | **Yes** |
| **Contact form after a search** | The lead carries `search_term` ("searched for …") so you know their intent | **Yes** |
| **Google Search Console** | The queries people used on Google that led to each storefront: views, clicks, average position | No — **Google never reveals who searched.** This is demand data for SEO and product decisions. |

Be careful how you sell this: the product *captures leads who contact the business* and *shows what the market is searching for*. It does not identify individual people who searched Google.

## SEO foundation (automatic)
- Per-store `<title>`, description, canonical URL, Open Graph/Twitter tags and `schema.org` Store/Offer JSON-LD.
- `/sitemap.xml` lists only published storefronts of workspaces with an active trial/subscription (enforced by RLS); `/robots.txt` points to it.
- Search-result pages are `noindex` (thin duplicate content) but still crawlable.
- Requires `APP_URL` to be your real public origin.

## Setup: Google Search Console sync (optional but recommended)
1. Deploy with HTTPS on your production domain and set `APP_URL`.
2. In [Search Console](https://search.google.com/search-console) add a property for the domain (Domain property `sc-domain:example.com`, or URL-prefix `https://app.example.com/`) and verify ownership.
3. Submit `https://YOUR_DOMAIN/sitemap.xml` under **Sitemaps**.
4. In Google Cloud: create a project → enable **Google Search Console API** → create a **service account** → create a JSON key.
5. In Search Console → Settings → Users and permissions → add the service account's email with **Restricted** access.
6. Set env vars: `GSC_SITE_URL` (the property exactly as in step 2), `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY` (the `private_key` value; keep `\n` escapes), and `CRON_SECRET` (`openssl rand -hex 32`).
7. Schedule `GET /api/cron/search-sync` daily with header `Authorization: Bearer $CRON_SECRET`. `vercel.json` already does this on Vercel; elsewhere use your scheduler (Azure Functions timer, GitHub Actions cron, cron-job.org).
8. Apply `supabase/migrations/003_search_insights.sql` (after 001 and 002).

One property serves **all** customers, because every storefront lives under your domain at `/s/<slug>`; no per-customer Google login is needed. Customers with their *own* domains are not covered (the app has no custom-domain support yet).

### Realistic expectations
- New pages take **weeks** to be indexed and ranked; early dashboards will be empty.
- Search Console reports with a **2–3 day delay** and hides rare queries for privacy, so small stores see few rows.
- The sync stores the top 100–200 queries per storefront for the last 28 complete days (~3 days behind).

## Privacy (important in India — DPDP Act 2023)
- On-site searches store **only** the normalized term and result count with the workspace ID. No IP address, cookie or user ID. Terms that look like an email address or a phone number are never stored; bots are skipped; logs are deleted after **90 days**; a per-IP rate limit prevents inflation.
- A search term becomes personal data once attached to a lead's contact details. The lead form shows a contact-consent line; **you must still publish a Privacy Policy** that covers search analytics, lead storage, retention, and how people can request deletion. Have counsel review it.
- Search Console data is aggregate and contains no personal data about individual searchers.

## How to turn insight into revenue (suggested product copy)
- *"No results" searches* = products customers want but the store doesn't list.
- *Leads from search* = high-intent leads; follow up first.
- *Google queries with many views but few clicks* = improve the store title/tagline/product names for those words.
