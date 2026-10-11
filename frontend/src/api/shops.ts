import { shopMock } from "../mocks/shopStore.ts";
import { client } from "./client.ts";
import { request, withFallback } from "./http.ts";
import type {
  Demand,
  DemandRange,
  DrinkInput,
  MenuSection,
  OfferRule,
  OfferRuleInput,
  OfferRules,
  ShopDrink,
  ShopProfilePatch,
} from "./types.ts";

/** Store tools. Each call tries Track A's route first and falls back to the in-browser mock. */

const base = (shopId: string) => `/shops/${encodeURIComponent(shopId)}`;
type DrinkPatch = Partial<DrinkInput & { available: boolean }>;

export const shops = {
  menu: (shopId: string) =>
    withFallback(
      () => request<{ drinks: ShopDrink[]; sections: MenuSection[] }>("GET", `${base(shopId)}/menu`),
      () => shopMock.menu(shopId),
    ),

  saveSections: (shopId: string, sections: MenuSection[]) =>
    withFallback(
      () => request<{ sections: MenuSection[] }>("PUT", `${base(shopId)}/menu/sections`, { sections }).then((body) => body.sections),
      () => shopMock.saveSections(shopId, sections),
    ),

  addDrink: (shopId: string, input: DrinkInput) =>
    withFallback(
      () => request<ShopDrink>("POST", `${base(shopId)}/drinks`, input),
      () => shopMock.addDrink(shopId, input),
    ),

  /** Sold out also goes to the live recommender's existing event, so the agents see it today. */
  updateDrink: async (shopId: string, drinkId: string, patch: DrinkPatch) => {
    const drink = await withFallback(
      () => request<ShopDrink>("PATCH", `${base(shopId)}/drinks/${encodeURIComponent(drinkId)}`, patch),
      () => shopMock.updateDrink(shopId, drinkId, patch),
    );
    if (patch.available === false) await client.setSoldOut(drinkId).catch(() => undefined);
    return drink;
  },

  removeDrink: (shopId: string, drinkId: string) =>
    withFallback(
      () => request<void>("DELETE", `${base(shopId)}/drinks/${encodeURIComponent(drinkId)}`),
      () => shopMock.removeDrink(shopId, drinkId),
    ),

  rules: (shopId: string) =>
    withFallback(
      () => request<OfferRules>("GET", `${base(shopId)}/offer-rules`),
      () => shopMock.rules(shopId),
    ),

  addRule: (shopId: string, input: OfferRuleInput) =>
    withFallback(
      () => request<OfferRule>("POST", `${base(shopId)}/offer-rules`, input),
      () => shopMock.addRule(shopId, input),
    ),

  updateRule: (shopId: string, ruleId: string, patch: Partial<OfferRuleInput>) =>
    withFallback(
      () => request<OfferRule>("PATCH", `${base(shopId)}/offer-rules/${encodeURIComponent(ruleId)}`, patch),
      () => shopMock.updateRule(shopId, ruleId, patch),
    ),

  removeRule: (shopId: string, ruleId: string) =>
    withFallback(
      () => request<void>("DELETE", `${base(shopId)}/offer-rules/${encodeURIComponent(ruleId)}`),
      () => shopMock.removeRule(shopId, ruleId),
    ),

  demand: (shopId: string, range: DemandRange) =>
    withFallback(
      () => request<Demand>("GET", `${base(shopId)}/demand?range=${range}`),
      () => shopMock.demand(shopId, range),
    ),

  updateProfile: (shopId: string, patch: ShopProfilePatch) =>
    withFallback(
      () => request<ShopProfilePatch>("PATCH", base(shopId), patch),
      () => shopMock.updateProfile(shopId, patch),
    ),
};
