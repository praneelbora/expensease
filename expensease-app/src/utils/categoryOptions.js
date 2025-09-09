// src/utils/categoryOptions.js
import { categoryMap } from "./categories";

/**
 * Normalize string: trim + lower
 * @param {any} s
 */
function normalize(s) {
  return (s || "").toString().trim().toLowerCase();
}

/**
 * Try to resolve to a canonical category key from the map.
 * Accepts:
 *  - category key (e.g. "groceries")
 *  - category label (e.g. "Groceries")
 *  - free text/name/keyword (e.g. "supermarket", "food")
 *  - an expense object with `.category`
 *
 * Returns the map key (e.g. "groceries") or null if none found.
 */
export function getCategoryKey(catOrExpense) {
  if (!catOrExpense) return null;

  let input;
  if (typeof catOrExpense === "object") {
    input = catOrExpense.category ?? catOrExpense.name ?? "";
  } else {
    input = catOrExpense;
  }
  const norm = normalize(input);
  if (!norm) return null;

  // direct key match
  if (Object.prototype.hasOwnProperty.call(categoryMap, norm)) return norm;

  // match label (e.g., "Groceries") or keywords
  for (const [key, def] of Object.entries(categoryMap)) {
    if (normalize(def.label) === norm) return key;
    // keywords array may contain phrases; check any match
    if (Array.isArray(def.keywords)) {
      for (const kw of def.keywords) {
        if (normalize(kw) === norm) return key;
      }
    }
  }

  // fuzzy: check if any keyword is included in input or input included in keyword (e.g., "supermarket" vs "supermarket store")
  for (const [key, def] of Object.entries(categoryMap)) {
    if (Array.isArray(def.keywords)) {
      for (const kw of def.keywords) {
        const nkw = normalize(kw);
        if (!nkw) continue;
        if (norm.includes(nkw) || nkw.includes(norm)) return key;
      }
    }
  }

  return null;
}

/**
 * Returns the human-friendly label for a category input (key/text/object).
 * Falls back to capitalized input or "Uncategorized".
 */
export function getCategoryLabel(catOrExpense) {
  const key = getCategoryKey(catOrExpense);
  if (key && categoryMap[key] && categoryMap[key].label) return categoryMap[key].label;

  // fallback: use provided value's stringified form (capitalized)
  let input = typeof catOrExpense === "object" ? catOrExpense.category ?? "" : catOrExpense ?? "";
  input = input.toString().trim();
  if (!input) return "Uncategorized";
  // capitalize each word
  return input
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Returns the icon name for a canonical key, or null.
 */
export function getCategoryIcon(catOrExpense) {
  const key = getCategoryKey(catOrExpense);
  if (key && categoryMap[key]) return categoryMap[key].icon || null;
  return null;
}

/**
 * Export the raw map (for list/legend usage)
 */
export const getAllCategories = () => categoryMap;
