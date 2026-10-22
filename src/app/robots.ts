import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  let base: string | null = null;
  try { base = new URL(process.env.APP_URL ?? "").origin; } catch { /* no sitemap hint without APP_URL */ }
  return {
    rules: [{ userAgent: "*", allow: ["/", "/s/"], disallow: ["/dashboard", "/api/", "/auth/", "/login"] }],
    ...(base ? { sitemap: `${base}/sitemap.xml`, host: base } : {}),
  };
}
