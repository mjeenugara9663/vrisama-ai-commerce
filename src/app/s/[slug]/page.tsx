/* eslint-disable @next/next/no-img-element -- merchant-supplied HTTPS image URLs on arbitrary hosts; next/image would need an open remotePatterns allowlist */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { LeadForm } from "@/components/LeadForm";
import { allow } from "@/lib/ratelimit";
import { BOT_UA, loggableSearchTerm, normalizeSearchTerm, searchProducts } from "@/lib/search";
import { getStore } from "@/lib/store";
import { adminClient } from "@/lib/supabase/admin";
import { clientIp } from "@/lib/utils";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string | string[] }> };
const origin = () => { try { return new URL(process.env.APP_URL ?? "").origin; } catch { return ""; } };
const firstParam = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params; const q = firstParam((await searchParams).q);
  const store = await getStore(slug);
  if (!store) return { title: "Store not found", robots: { index: false } };
  const { site, products } = store;
  const description = (site.tagline || `Browse ${products.length} products from ${site.title}.`).slice(0, 160);
  const url = `${origin()}/s/${site.slug}`;
  return {
    title: site.title, description,
    alternates: { canonical: url },
    // Search-result pages are thin, near-duplicate content: keep them out of Google, but let crawlers follow links.
    robots: q ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { type: "website", title: site.title, description, url, siteName: site.title, ...(products[0]?.image_url ? { images: [products[0].image_url] } : {}) },
    twitter: { card: products[0]?.image_url ? "summary_large_image" : "summary", title: site.title, description },
  };
}

export default async function PublicStore({ params, searchParams }: Props) {
  const { slug } = await params;
  const rawQuery = firstParam((await searchParams).q).slice(0, 200);
  const store = await getStore(slug);
  if (!store) notFound();
  const { site, products } = store;

  const q = normalizeSearchTerm(rawQuery);
  const searching = q.length >= 2;
  const shown = searching ? searchProducts(products, q) : products;

  if (searching) {
    const h = await headers();
    const term = loggableSearchTerm(rawQuery);
    // Anonymous demand signal: only the normalized term + result count are stored (no IP, no identifiers).
    if (term && !BOT_UA.test(h.get("user-agent") ?? "")) {
      const ip = clientIp(h), orgId = site.org_id, count = shown.length;
      after(async () => {
        if (!(await allow("search-ip", ip, 30, 600))) return;
        const { error } = await adminClient().from("store_searches").insert({ org_id: orgId, term, results: count });
        if (error) console.error("store search log failed", error.message);
      });
    }
  }

  const jsonLd = {
    "@context": "https://schema.org", "@type": "Store", name: site.title, description: site.tagline, url: `${origin()}/s/${site.slug}`,
    hasOfferCatalog: {
      "@type": "OfferCatalog", name: `${site.title} catalog`,
      itemListElement: products.slice(0, 50).map(p => ({
        "@type": "Offer", priceCurrency: "INR", price: Number(p.price_inr),
        itemOffered: { "@type": "Product", name: p.name, description: p.description || undefined, image: p.image_url || undefined },
      })),
    },
  };

  return <main className="publicstore" style={{ "--store-accent": site.accent } as React.CSSProperties}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}/>
    <div className="shell"><div className="storehead"><div className="storebrand">{site.title}</div><a href="#contact">Get in touch ↗</a></div>
      <section className="storehero"><div className="eyebrow">WELCOME TO OUR STORE</div><h1>{site.title}</h1><p>{site.tagline}</p><a href="#catalog" className="btn btnprimary">Explore collection ↓</a></section>
      <section id="catalog" className="storecatalog"><div className="sectionlabel">OUR COLLECTION</div><h2>{searching ? <>Results for &ldquo;{rawQuery.trim().slice(0, 60)}&rdquo;</> : "Made for you."}</h2>
        <form action={`/s/${site.slug}`} method="get" role="search" className="storesearch">
          <input type="search" name="q" defaultValue={rawQuery} maxLength={80} placeholder="Search products…" aria-label="Search products"/>
          <button className="btn btnprimary" type="submit">Search</button>
          {searching && <a className="btn btnoutline" href={`/s/${site.slug}`}>Clear</a>}
        </form>
        <div className="productgrid">{shown.map(p => <article className="publicproduct" key={p.id}><div className="publicproductimage">{p.image_url ? <img src={p.image_url} alt={p.name} referrerPolicy="no-referrer"/> : <span>{p.name.slice(0, 1)}</span>}</div><div className="productcopy"><h3>{p.name}</h3><p>{p.description}</p><strong>₹{Number(p.price_inr).toLocaleString("en-IN")}</strong></div></article>)}
          {!shown.length && !searching && <p className="empty">Our catalog is being prepared. Get in touch to learn more.</p>}
        </div>
        {searching && !shown.length && <div className="noresults" id="request">
          <h3>We couldn&apos;t find &ldquo;{rawQuery.trim().slice(0, 60)}&rdquo; — but we may be able to help.</h3>
          <p>Tell us what you&apos;re looking for and the team will get back to you.</p>
          <LeadForm slug={slug} searchTerm={q} defaultMessage={`I'm looking for: ${rawQuery.trim().slice(0, 80)}`}/>
        </div>}
      </section>
      <section id="contact" className="contactsection"><div><div className="sectionlabel">TALK TO US</div><h2>Have something<br/>in mind?</h2><p>Share your requirements, and our team will reach out.</p></div><div className="contactform"><LeadForm slug={slug} searchTerm={searching ? q : undefined}/></div></section>
    </div></main>;
}
