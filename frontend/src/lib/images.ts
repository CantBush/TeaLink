import { type CatalogDrink, drinkBase, drinkInfo } from "./catalog.ts";

/** Placeholder pictures in public/img. A real photo_url or cover_url always wins over these. */

const STYLE_BY_NAME: [RegExp, string][] = [
  [/coffee/i, "coffee"],
  [/horchata/i, "horchata"],
  [/taro|ube|sesame/i, "taro"],
  [/matcha/i, "matcha"],
  [/thai/i, "thai"],
  [/hojicha/i, "hojicha"],
  [/brown sugar|black sugar/i, "brown_sugar"],
];

const STYLE_BY_TAG: Record<string, string> = {
  matcha: "matcha",
  taro: "taro",
  thai_tea: "thai",
  hojicha: "hojicha",
  brown_sugar: "brown_sugar",
};

export function drinkStyle(drink: CatalogDrink): string {
  for (const [pattern, style] of STYLE_BY_NAME) if (pattern.test(drink.name)) return style;
  for (const tag of drink.flavor_tags) if (STYLE_BY_TAG[tag]) return STYLE_BY_TAG[tag];
  const base = drinkBase(drink);
  if (base === "fruit") return "fruit";
  if (base === "tea") return "oolong";
  return "classic";
}

export function drinkPhoto(drinkId: string | null | undefined, photoUrl?: string | null): string | null {
  if (photoUrl) return photoUrl;
  const drink = drinkInfo(drinkId);
  return drink ? `/img/drinks/${drinkStyle(drink)}.jpg` : null;
}

const SHOP_PHOTOS = new Set(["kungfu", "sunright", "tigersugar", "boba_guys", "sharetea", "lantern_leaf"]);

export function shopPhoto(shopId: string | null | undefined): string | null {
  return shopId && SHOP_PHOTOS.has(shopId) ? `/img/shops/${shopId}.jpg` : null;
}

export const COVERS = ["pearls", "leaves", "swirl", "fruit", "matcha", "lineup"] as const;
export type CoverId = (typeof COVERS)[number];

const COVER_KEY = "tealink.covers.v1";

function chosenCovers(): Record<string, CoverId> {
  try {
    return JSON.parse(localStorage.getItem(COVER_KEY) ?? "{}") as Record<string, CoverId>;
  } catch {
    return {};
  }
}

/** The backend's PATCH /users doesn't take a cover yet, so the choice is kept in this browser. */
export function setCover(userId: string, cover: CoverId) {
  localStorage.setItem(COVER_KEY, JSON.stringify({ ...chosenCovers(), [userId]: cover }));
}

export function resetCovers() {
  localStorage.removeItem(COVER_KEY);
}

const COVER_BY_NOTE: Record<string, CoverId> = {
  brown_sugar: "pearls",
  fruit: "fruit",
  matcha: "matcha",
  oolong: "leaves",
  jasmine: "leaves",
  hojicha: "swirl",
  thai_tea: "lineup",
  taro: "lineup",
};

interface CoverOwner {
  user_id: string;
  cover_url?: string | null;
  stats?: { top_notes?: string[] };
}

/** The user's pick if they made one, else one that fits their top flavor. */
export function coverId(owner: CoverOwner): CoverId {
  const chosen = chosenCovers()[owner.user_id];
  if (chosen && COVERS.includes(chosen)) return chosen;
  const byNote = COVER_BY_NOTE[owner.stats?.top_notes?.[0] ?? ""];
  if (byNote) return byNote;
  let hash = 0;
  for (const char of owner.user_id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COVERS[hash % COVERS.length];
}

export function coverPhoto(owner: CoverOwner, preview?: CoverId): string {
  if (!preview && owner.cover_url) return owner.cover_url;
  return `/img/covers/${preview ?? coverId(owner)}.jpg`;
}
