import { searchProducts as rank } from "./search.mjs";
export { normalizeSearchTerm, searchTokens, loggableSearchTerm, BOT_UA } from "./search.mjs";

/** Ranks products against a search term (typed wrapper around the dependency-free implementation). */
export function searchProducts<T extends { name: string; description?: string | null }>(products: T[], term: string): T[] {
  return rank(products, term) as T[];
}
