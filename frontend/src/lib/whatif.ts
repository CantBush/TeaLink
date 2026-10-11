import type { TasteAttribute, WhatIf, WhatIfKind, WhatIfParse } from "../api/types.ts";
import { allDrinks, drinkName } from "./catalog.ts";
import { SHOP_IDS, price, shopLabel } from "./format.ts";
import { noteLabel } from "./stats.ts";

export const KIND_LABEL: Record<WhatIfKind, string> = {
  sold_out: "A drink sells out",
  restock: "A drink is back in stock",
  shop_offline: "A shop goes offline",
  shop_online: "A shop comes back online",
  shop_join: "A shop joins",
  avoid: "I don't want a flavor",
  taste: "More or less of a taste",
  max_price: "A price limit for this order",
  price: "A drink's price changes",
};

const TASTE_WORD: Record<TasteAttribute, { more: string; less: string }> = {
  sweetness: { more: "sweeter", less: "less sweet" },
  milkiness: { more: "milkier", less: "less milky" },
  tea_intensity: { more: "more tea", less: "less tea" },
  fruitiness: { more: "fruitier", less: "less fruity" },
  toppings: { more: "more toppings", less: "fewer toppings" },
};

export function tasteWord(attribute: TasteAttribute, direction: "more" | "less"): string {
  return TASTE_WORD[attribute][direction];
}

/** Every flavor tag on the menu, for the builder and the parser. */
export function allFlavors(): string[] {
  return [...new Set(allDrinks().flatMap((drink) => drink.flavor_tags))].sort();
}

/** The chip text for one change: "Taro Milk Tea: sold out", "sweetness: lower", "under $6.00". */
export function describeWhatIf(change: WhatIf): string {
  switch (change.kind) {
    case "sold_out":
      return `${drinkName(change.drink_id)}: sold out`;
    case "restock":
      return `${drinkName(change.drink_id)}: back in stock`;
    case "shop_offline":
      return `${shopLabel(change.shop_id)}: offline`;
    case "shop_online":
      return `${shopLabel(change.shop_id)}: back online`;
    case "shop_join":
      return `${shopLabel(change.shop_id)} joins`;
    case "avoid":
      return `no ${noteLabel(change.tag).toLowerCase()}`;
    case "taste":
      return tasteWord(change.attribute, change.direction);
    case "max_price":
      return `under ${price(change.dollars)}`;
    case "price":
      return `${drinkName(change.drink_id)}: now ${price(change.dollars)}`;
  }
}

export function sameWhatIf(a: WhatIf, b: WhatIf): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const GENERIC = new Set(["tea", "milk", "the", "with", "and", "of"]);
const SHOP_KEYS = SHOP_IDS.map((id) => ({
  id,
  key: shopLabel(id)
    .toLowerCase()
    .replace(/\b(tea|co\.?|studio|lab|lounge)\b/g, "")
    .replace(/\s+/g, " ")
    .trim(),
}));

const TASTE_PATTERNS: { pattern: RegExp; attribute: TasteAttribute; direction: "more" | "less" }[] = [
  { pattern: /\bsweeter\b|\bmore sweet/, attribute: "sweetness", direction: "more" },
  { pattern: /\b(less|not as|not too|less of a) sweet/, attribute: "sweetness", direction: "less" },
  { pattern: /\bmilkier\b|\bmore milk/, attribute: "milkiness", direction: "more" },
  { pattern: /\b(less|not as) milk/, attribute: "milkiness", direction: "less" },
  { pattern: /\b(more|stronger) tea\b|\btea-forward\b|\bstronger\b/, attribute: "tea_intensity", direction: "more" },
  { pattern: /\b(less|lighter|weaker) tea\b/, attribute: "tea_intensity", direction: "less" },
  { pattern: /\bfruitier\b|\bmore fruit/, attribute: "fruitiness", direction: "more" },
  { pattern: /\b(less|not as) fruit/, attribute: "fruitiness", direction: "less" },
  { pattern: /\bmore toppings?\b/, attribute: "toppings", direction: "more" },
  { pattern: /\b(fewer|less|no) toppings?\b/, attribute: "toppings", direction: "less" },
];

function findShop(clause: string): string | null {
  return SHOP_KEYS.find((shop) => shop.key && clause.includes(shop.key))?.id ?? null;
}

function findDrink(clause: string, shopId: string | null): string | null {
  let best: { id: string; score: number } | null = null;
  for (const drink of allDrinks()) {
    if (shopId && drink.shop_id !== shopId) continue;
    const words = drink.name.toLowerCase().split(/\s+/).filter((word) => !GENERIC.has(word));
    const hits = words.filter((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(clause)).length;
    const score = hits / Math.max(words.length, 1) + (clause.includes(drink.name.toLowerCase()) ? 1 : 0);
    if (hits > 0 && (!best || score > best.score)) best = { id: drink.id, score };
  }
  return best?.id ?? null;
}

function dollars(clause: string): number | null {
  const match = clause.match(/\$\s?(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s?(?:dollars|bucks)/);
  return match ? Number(match[1] ?? match[2]) : null;
}

/**
 * The keyword matcher Track A also uses when there's no LLM key. It only produces known kinds with real
 * ids; any clause it can't place goes to `not_understood` and is never applied.
 */
export function parseWhatIfText(text: string): WhatIfParse {
  const changes: WhatIf[] = [];
  const not_understood: string[] = [];
  const flavors = allFlavors();
  const clauses = text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .split(/[,;.\n]|\band\b|\bbut\b/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const clause of clauses) {
    const found: WhatIf[] = [];
    const shopId = findShop(clause);
    const amount = dollars(clause);

    if (amount !== null && /\b(under|below|less than|max|at most|no more than|budget)\b/.test(clause)) {
      found.push({ kind: "max_price", dollars: amount });
    }
    for (const taste of TASTE_PATTERNS) {
      if (taste.pattern.test(clause)) found.push({ kind: "taste", attribute: taste.attribute, direction: taste.direction });
    }
    const avoid = clause.match(/\b(?:no|don't like|do not like|without|hate|avoid|not into|allergic to|skip)\s+(.+)/);
    if (avoid) {
      const tag = flavors.find((item) => avoid[1].includes(noteLabel(item).toLowerCase()) || avoid[1].includes(item.replace(/_/g, " ")));
      if (tag) found.push({ kind: "avoid", tag });
    }

    const drinkId = findDrink(clause, shopId);
    if (drinkId && /\bsold out\b|\bout of stock\b|\bran out\b|\bunavailable\b/.test(clause)) found.push({ kind: "sold_out", drink_id: drinkId });
    else if (drinkId && /\bback in stock\b|\brestock|\bback\b|\bavailable again\b/.test(clause)) found.push({ kind: "restock", drink_id: drinkId });
    else if (drinkId && amount !== null && /\b(costs?|now|price|is)\b/.test(clause) && !found.some((item) => item.kind === "max_price")) {
      found.push({ kind: "price", drink_id: drinkId, dollars: amount });
    } else if (shopId && !found.length) {
      if (/\boffline\b|\bclosed?\b|\bdown\b/.test(clause)) found.push({ kind: "shop_offline", shop_id: shopId });
      else if (/\bjoins?\b|\bjoined\b|\bnew\b/.test(clause)) found.push({ kind: "shop_join", shop_id: shopId });
      else if (/\bonline\b|\bopen\b|\bback\b/.test(clause)) found.push({ kind: "shop_online", shop_id: shopId });
    }

    if (found.length) found.forEach((change) => changes.some((item) => sameWhatIf(item, change)) || changes.push(change));
    else not_understood.push(clause);
  }
  return { changes, not_understood };
}
