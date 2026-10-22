// Pure search helpers (no dependencies) so they can be unit-tested with `node --test`.

const STOP = new Set(["the", "a", "an", "and", "or", "for", "of", "in", "on", "to", "with", "near", "me", "best", "buy", "online", "shop", "store"]);

/** Lower-case, strip Latin accents, drop punctuation (keeps all scripts incl. Devanagari marks), collapse whitespace. */
export function normalizeSearchTerm(input) {
  return String(input ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ").trim().slice(0, 80);
}

function stem(word) {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Meaningful, de-duplicated search tokens (stop-words removed, light plural stemming, max 6). */
export function searchTokens(term) {
  const out = [];
  for (const raw of normalizeSearchTerm(term).split(/[\s-]+/)) {
    if (!raw || STOP.has(raw)) continue;
    const t = stem(raw);
    if (t.length >= 2 && !out.includes(t)) out.push(t);
    if (out.length === 6) break;
  }
  return out;
}

/**
 * Ranks products against a search term. Name matches outweigh description matches; any matching token counts,
 * so "silk sarees" finds a "Pure Silk Saree". Substring matching tolerates partial words ("kurt" finds "kurta").
 */
export function searchProducts(products, term) {
  const tokens = searchTokens(term);
  if (!tokens.length) return [];
  return products
    .map((p, index) => {
      const name = normalizeSearchTerm(p.name), desc = normalizeSearchTerm(p.description);
      let score = 0;
      for (const t of tokens) score += (name.includes(t) ? 3 : 0) + (desc.includes(t) ? 1 : 0);
      return { p, score, index };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(x => x.p);
}

/**
 * Returns the normalized term to log, or null when it must NOT be stored (too short, or it looks like personal data
 * such as an email address or phone number typed into the search box).
 */
export function loggableSearchTerm(raw) {
  const text = String(raw ?? "");
  if (text.includes("@") || (text.match(/\d/g) || []).length >= 7) return null;
  const n = normalizeSearchTerm(text);
  return n.length >= 2 ? n : null;
}

export const BOT_UA = /bot|crawl|spider|slurp|preview|headless|monitor|curl|wget|python-requests|facebookexternalhit/i;
