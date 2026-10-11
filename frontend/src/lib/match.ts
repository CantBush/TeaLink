import type { TasteProfile } from "../api/types.ts";
import type { CatalogDrink } from "./catalog.ts";
import { TASTE_ORDER } from "./format.ts";

/** 0..1: how close a drink's attributes sit to your taste profile. Prefers the API's `match` when it sends one. */
export function drinkMatch(taste: TasteProfile, drink: CatalogDrink & { match?: number }): number {
  if (typeof drink.match === "number") return drink.match;
  const gaps = TASTE_ORDER.map((key) => Math.abs((taste[key] ?? 0) - (drink.attributes[key] ?? 0)));
  return 1 - gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
}

/** A shop matches you as well as its best drink does. */
export function shopMatch(taste: TasteProfile, menu: CatalogDrink[]): number {
  return Math.max(0, ...menu.map((drink) => drinkMatch(taste, drink)));
}
