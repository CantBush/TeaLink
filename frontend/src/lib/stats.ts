import type { StatKey } from "../api/types.ts";
import { factorLabel } from "./format.ts";

export const ALL_STATS: StatKey[] = [
  "fav_drink",
  "fav_shop",
  "top_notes",
  "tried_count",
  "shops_visited",
  "streak",
  "priorities",
];

/** Stats the backend still serves but the UI no longer shows. */
const RETIRED: StatKey[] = ["sweetness", "milk_vs_fruit", "toppings"];

/** Drinks tried, shops visited, and streak read as one "boba run" section. */
export const RUN_STATS: StatKey[] = ["streak", "shops_visited", "tried_count"];

export function shownStats(keys: StatKey[]): StatKey[] {
  return keys.filter((key) => !RETIRED.includes(key));
}

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
