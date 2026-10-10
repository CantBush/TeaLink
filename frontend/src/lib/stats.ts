import type { StatKey } from "../api/types.ts";
import { factorLabel } from "./format.ts";

export const ALL_STATS: StatKey[] = [
  "fav_drink",
  "fav_shop",
  "sweetness",
  "milk_vs_fruit",
  "toppings",
  "top_notes",
  "tried_count",
  "shops_visited",
  "streak",
  "priorities",
];

export const STAT_LABELS: Record<StatKey, string> = {
  fav_drink: "Favorite drink",
  fav_shop: "Favorite shop",
  sweetness: "Sweet vs not sweet",
  milk_vs_fruit: "Milk vs fruit",
  toppings: "Toppings",
  top_notes: "Top flavors",
  tried_count: "Drinks tried",
  shops_visited: "Shops visited",
  streak: "Boba streak",
  priorities: "What matters most",
};

/** "brown_sugar" → "Brown Sugar". */
export function noteLabel(tag: string): string {
  return factorLabel(tag);
}

export function sweetnessWord(value: number): string {
  if (value >= 0.75) return "Full sugar";
  if (value >= 0.5) return "Sweet";
  if (value >= 0.3) return "Lightly sweet";
  return "Barely sweet";
}

export function toppingsWord(value: number): string {
  if (value >= 0.7) return "Loaded";
  if (value >= 0.4) return "Boba, always";
  return "Keeps it simple";
}

export function milkFruitWord(value: number): string {
  if (value >= 0.7) return "Team milk";
  if (value <= 0.3) return "Team fruit";
  return "A bit of both";
}
