/** Canonical public origin. Prefer APP_URL (correct behind proxies/CDNs); fall back to the request's origin. */
export function appOrigin(request: Request): string {
  const configured = process.env.APP_URL;
  if (configured) { try { return new URL(configured).origin; } catch { /* fall through */ } }
  return new URL(request.url).origin;
}
