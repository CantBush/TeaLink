import type { Dimension } from "../api/types.ts";

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

export function shopLabel(shopId: string): string {
  return SHOPS[shopId] ?? shopId;
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

export function attributeLabel(key: string): string {
  if (key === "tea_intensity") return "Tea";
  return factorLabel(key);
}
