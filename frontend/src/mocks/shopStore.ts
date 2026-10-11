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
} from "../api/types.ts";
import { allDrinks, drinkBase } from "../lib/catalog.ts";

/**
 * Store tools in this browser until Track A serves them: menu sections, drink edits, the shop's own
 * offer rules, its picture and description, and sample demand. Reset demo clears it.
 */

interface ShopState {
  sections: MenuSection[] | null;
  drinks: Record<string, ShopDrink>;
  removed: string[];
  rules: OfferRule[];
  description?: string;
  photo_url?: string | null;
}

const PREFIX = "tealink.mock_shop.";
const CAP = { percent: 10, dollars: 1 };

export const PLATFORM_RULES = [
  { id: "runner_up", text: "Your drink is the runner-up." },
  { id: "close", text: "The top two scores are within 0.02." },
  { id: "different_shops", text: "The top two come from different shops." },
  { id: "losing_on_price", text: "Your drink is losing on price." },
];

const DEFAULT_OPTIONS = {
  sugar: ["0%", "25%", "50%", "75%", "100%"],
  ice: ["no ice", "less ice", "regular ice"],
  toppings: [
    { name: "pearls", price: 0.75 },
    { name: "grass jelly", price: 0.75 },
    { name: "cheese foam", price: 1 },
  ],
};

function read(shopId: string): ShopState {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFIX + shopId) ?? "null") as ShopState | null;
    if (parsed) return parsed;
  } catch {
    /* fall through to a fresh state */
  }
  return { sections: null, drinks: {}, removed: [], rules: [] };
}

function write(shopId: string, state: ShopState) {
  try {
    localStorage.setItem(PREFIX + shopId, JSON.stringify(state));
  } catch {
    /* Private mode or a photo too big for storage: keep the old state. */
  }
}

const id = () => crypto.randomUUID().slice(0, 8);

function drinks(shopId: string, state: ShopState): ShopDrink[] {
  const seeded = allDrinks()
    .filter((drink) => drink.shop_id === shopId && !state.removed.includes(drink.id))
    .map<ShopDrink>((drink) => ({ ...drink, available: true, options: DEFAULT_OPTIONS, ...(state.drinks[drink.id] as Partial<ShopDrink> | undefined) }));
  const added = Object.values(state.drinks).filter((drink) => !seeded.some((item) => item.id === drink.id));
  return [...seeded, ...added.filter((drink) => drink.shop_id === shopId && !state.removed.includes(drink.id))];
}

const BASE_SECTION = { milk: "milk teas", fruit: "fruit teas", tea: "tea-forward" } as const;

function defaultSections(menu: ShopDrink[]): MenuSection[] {
  return (Object.keys(BASE_SECTION) as (keyof typeof BASE_SECTION)[])
    .map((base) => ({ base, ids: menu.filter((drink) => drinkBase(drink) === base).map((drink) => drink.id) }))
    .filter((group) => group.ids.length > 0)
    .map((group, order) => ({ id: group.base, name: BASE_SECTION[group.base], order, drink_ids: group.ids }));
}

/** Every drink sits in exactly one section; new drinks land in the first. */
function sections(state: ShopState, menu: ShopDrink[]): MenuSection[] {
  const list = (state.sections ?? defaultSections(menu)).map((section) => ({
    ...section,
    drink_ids: section.drink_ids.filter((drinkId) => menu.some((drink) => drink.id === drinkId)),
  }));
  const placed = new Set(list.flatMap((section) => section.drink_ids));
  const loose = menu.filter((drink) => !placed.has(drink.id)).map((drink) => drink.id);
  if (loose.length) {
    if (list.length === 0) list.push({ id: id(), name: "menu", order: 0, drink_ids: [] });
    list[0] = { ...list[0], drink_ids: [...list[0].drink_ids, ...loose] };
  }
  return list.sort((a, b) => a.order - b.order);
}

/** Deterministic 0..1 noise so sample demand doesn't jump around between renders. */
function noise(key: string): number {
  let h = 2166136261;
  for (const char of key) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const PEOPLE: Record<DemandRange, number> = { week: 42, month: 176, year: 1940 };

export const shopMock = {
  menu(shopId: string): { drinks: ShopDrink[]; sections: MenuSection[] } {
    const state = read(shopId);
    const menu = drinks(shopId, state);
    return { drinks: menu, sections: sections(state, menu) };
  },

  saveSections(shopId: string, next: MenuSection[]): MenuSection[] {
    const state = read(shopId);
    state.sections = next.map((section, order) => ({ ...section, id: section.id || id(), order }));
    write(shopId, state);
    return this.menu(shopId).sections;
  },

  addDrink(shopId: string, input: DrinkInput): ShopDrink {
    const state = read(shopId);
    const drink: ShopDrink = { ...input, id: `${shopId}_${id()}`, shop_id: shopId, available: true };
    state.drinks[drink.id] = drink;
    write(shopId, state);
    return drink;
  },

  updateDrink(shopId: string, drinkId: string, patch: Partial<DrinkInput & { available: boolean }>): ShopDrink {
    const state = read(shopId);
    const current = drinks(shopId, state).find((drink) => drink.id === drinkId);
    if (!current) throw new Error("That drink isn't on your menu.");
    state.drinks[drinkId] = { ...current, ...patch };
    write(shopId, state);
    return state.drinks[drinkId];
  },

  removeDrink(shopId: string, drinkId: string) {
    const state = read(shopId);
    state.removed = [...state.removed, drinkId];
    delete state.drinks[drinkId];
    write(shopId, state);
  },

  rules(shopId: string): OfferRules {
    return { platform: PLATFORM_RULES, rules: read(shopId).rules, cap: CAP };
  },

  addRule(shopId: string, input: OfferRuleInput): OfferRule {
    const state = read(shopId);
    const rule = { ...input, id: id() } as OfferRule;
    state.rules = [...state.rules, rule];
    write(shopId, state);
    return rule;
  },

  updateRule(shopId: string, ruleId: string, patch: Partial<OfferRuleInput>): OfferRule {
    const state = read(shopId);
    let updated: OfferRule | null = null;
    state.rules = state.rules.map((rule) => (rule.id === ruleId ? (updated = { ...rule, ...patch } as OfferRule) : rule));
    if (!updated) throw new Error("That rule no longer exists.");
    write(shopId, state);
    return updated;
  },

  removeRule(shopId: string, ruleId: string) {
    const state = read(shopId);
    state.rules = state.rules.filter((rule) => rule.id !== ruleId);
    write(shopId, state);
  },

  profile(shopId: string): ShopProfilePatch {
    const { description, photo_url } = read(shopId);
    return { description, photo_url };
  },

  updateProfile(shopId: string, patch: ShopProfilePatch): ShopProfilePatch {
    const state = { ...read(shopId), ...patch };
    write(shopId, state);
    return this.profile(shopId);
  },

  demand(shopId: string, range: DemandRange): Demand {
    const catalog = allDrinks();
    const people = PEOPLE[range];
    const counts = catalog
      .map((drink) => ({ drink_id: drink.id, count: Math.round(people * (0.02 + 0.12 * noise(`${drink.id}:${range}`))) }))
      .sort((a, b) => b.count - a.count);
    const total = counts.reduce((sum, item) => sum + item.count, 0) || 1;
    const baseShare = { milk: 0, fruit: 0, tea: 0 };
    const tagShare = new Map<string, number>();
    for (const item of counts) {
      const drink = catalog.find((entry) => entry.id === item.drink_id)!;
      baseShare[drinkBase(drink)] += item.count / total;
      for (const tag of drink.flavor_tags) tagShare.set(tag, (tagShare.get(tag) ?? 0) + item.count / total);
    }
    const tagTotal = [...tagShare.values()].reduce((sum, value) => sum + value, 0) || 1;
    const lean = { week: 0.04, month: 0.02, year: 0 }[range];
    return {
      range,
      people,
      bases: (Object.keys(baseShare) as (keyof typeof baseShare)[]).map((base) => ({ base, share: baseShare[base] })),
      flavors: [...tagShare.entries()]
        .map(([tag, value]) => ({ tag, share: value / tagTotal }))
        .sort((a, b) => b.share - a.share)
        .slice(0, 6),
      top_drinks: counts.filter((item) => item.count >= 5).slice(0, 5),
      own_top_drinks: counts.filter((item) => item.count >= 5 && catalog.find((drink) => drink.id === item.drink_id)?.shop_id === shopId).slice(0, 5),
      priorities: { taste: 0.38 + lean, social: 0.14, novelty: 0.1 + lean, cost: 0.38 - 2 * lean },
    };
  },

  reset() {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(PREFIX))
        .forEach((key) => localStorage.removeItem(key));
    } catch {
      /* nothing stored */
    }
  },
};
