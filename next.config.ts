import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";
// Allow the browser to talk to YOUR Supabase project (auth). Falls back to any *.supabase.co.
let supabaseOrigins = "https://*.supabase.co wss://*.supabase.co";
try {
  const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  supabaseOrigins = `${u.origin} wss://${u.host}`;
} catch { /* keep wildcard fallback */ }

// If you add third-party scripts/embeds (analytics, chat, Razorpay Checkout.js), extend these lists deliberately.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigins}${dev ? " ws://localhost:* http://localhost:*" : ""}`,
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() { return [{ source: "/:path*", headers: securityHeaders }]; },
};
export default nextConfig;
