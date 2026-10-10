import type { TasteProfile } from "../api/types.ts";
import catalogRaw from "../mocks/social/catalog.json";

/** Drink names and shops for ids that arrive without them (profiles, feed). Built from the seed by scripts/build-social-mocks.mjs. */

export interface CatalogDrink {
  id: string;
  name: string;
  shop_id: string;
  price: number;
  flavor_tags: string[];
  attributes: TasteProfile;
}

export type DrinkBase = "milk" | "fruit" | "tea";

/** Which way a drink leans: creamy milk tea, fruit tea, or tea-forward. */
export function drinkBase(drink: CatalogDrink): DrinkBase {
  const { milkiness, fruitiness, tea_intensity } = drink.attributes;
  if (milkiness >= fruitiness && milkiness >= tea_intensity) return "milk";
  if (fruitiness >= tea_intensity) return "fruit";
  return "tea";
}

const catalog = catalogRaw as CatalogDrink[];
const byId = new Map(catalog.map((drink) => [drink.id, drink]));

export function drinkInfo(drinkId: string | null | undefined): CatalogDrink | null {
  return drinkId ? (byId.get(drinkId) ?? null) : null;
}

export function drinkName(drinkId: string | null | undefined): string {
  return drinkInfo(drinkId)?.name ?? "a drink";
}

export function allDrinks(): CatalogDrink[] {
  return catalog;
}
