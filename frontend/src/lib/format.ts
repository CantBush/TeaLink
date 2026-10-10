import type { Dimension, TasteAttribute } from "../api/types.ts";

export const TASTE_ORDER: TasteAttribute[] = ["sweetness", "milkiness", "tea_intensity", "fruitiness", "toppings"];

const SHOPS: Record<string, string> = {
  kungfu: "Kung Fu Tea",
  "shop:kungfu": "Kung Fu Tea",
  sunright: "Sunright Tea Studio",
  tigersugar: "Tiger Sugar Lab",
  boba_guys: "Boba Guys",
  sharetea: "Sharetea Lounge",
  lantern_leaf: "Lantern Leaf",
};

export const DIMENSIONS: Dimension[] = ["taste", "cost", "novelty", "social"];

const DIMENSION_LABELS: Record<Dimension, string> = {
  taste: "Taste match",
  cost: "Price",
  novelty: "Something new",
  social: "People like you",
};

export function matchPercent(score: number): number {
  return Math.round(score * 100);
}

export const SHOP_IDS = Object.keys(SHOPS).filter((id) => !id.includes(":"));

export function shopLabel(shopId: string): string {
  return SHOPS[shopId] ?? shopId;
}

const SHOP_ID_PATTERN = new RegExp(`\\b(${SHOP_IDS.join("|")})\\b`, "g");

/** Swap raw shop ids in backend text for display names: "online for lantern_leaf" → "online for Lantern Leaf". */
export function readableShops(text: string): string {
  return text.replace(SHOP_ID_PATTERN, (id) => shopLabel(id));
}

/** "taste" → "Taste", "shop_kungfu" / "shop:kungfu" → "Kung Fu Tea". */
export function agentLabel(agentId: string): string {
  const shop = agentId.match(/^shop[_:](.+)$/);
  if (shop) return shopLabel(shop[1]);
  return factorLabel(agentId);
}

export function dimensionLabel(dimension: Dimension): string {
  return DIMENSION_LABELS[dimension];
}

export function price(value: number | undefined): string {
  return typeof value === "number" && value > 0 ? `$${value.toFixed(2)}` : "";
}

export function factorLabel(factor: string): string {
  return factor
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** "just now", "12m", "3h", "2d", or a short date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function attributeLabel(key: string): string {
  if (key === "tea_intensity") return "Tea";
  return factorLabel(key);
}
