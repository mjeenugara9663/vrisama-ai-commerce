import { createHmac, timingSafeEqual } from "node:crypto";
export function hmac(body, secret) {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}
export function verifyHexSignature(body, secret, submitted) {
  if (!secret || !submitted || !/^[0-9a-f]{64}$/i.test(submitted)) return false;
  const expected = Buffer.from(hmac(body, secret), "hex");
  const actual = Buffer.from(submitted, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
