import "server-only";
export { signServiceAccountJwt, getAccessToken, defaultDateRange, fetchSearchRows, aggregateBySlug } from "./gsc.mjs";

export function gscConfig() {
  const siteUrl = process.env.GSC_SITE_URL;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  return siteUrl && email && privateKey ? { siteUrl, email, privateKey } : null;
}
