import { useSyncExternalStore } from "react";

/**
 * Sold-out, auto-offer, and online for the store screens.
 * This browser only: nothing here calls /events/sold-out, /events/shop-offline, or /events/shop-join.
 */

const SOLD_KEY = "tealink.shop.sold_out";
const AUTO_KEY = "tealink.shop.auto_offer";
const ONLINE_KEY = "tealink.shop.online";

type FlagMap = Record<string, boolean>;

function readSold(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SOLD_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readFlags(key: string): FlagMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const flags: FlagMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") flags[id] = value;
    }
    return flags;
  } catch {
    return {};
  }
}

let soldOut = readSold();
let autoOffer = readFlags(AUTO_KEY);
let online = readFlags(ONLINE_KEY);
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private mode: keep it for this tab only. */
  }
}

export function useSoldOut(): string[] {
  return useSyncExternalStore(subscribe, () => soldOut);
}

export function markSoldOut(drinkId: string, sold: boolean) {
  soldOut = sold ? [...soldOut.filter((id) => id !== drinkId), drinkId] : soldOut.filter((id) => id !== drinkId);
  write(SOLD_KEY, soldOut);
  emit();
}

function flag(map: FlagMap, shopId: string, fallback: boolean): boolean {
  return typeof map[shopId] === "boolean" ? map[shopId] : fallback;
}

export function useAutoOffer(shopId: string): boolean {
  return useSyncExternalStore(subscribe, () => flag(autoOffer, shopId, true));
}

export function setAutoOffer(shopId: string, on: boolean) {
  autoOffer = { ...autoOffer, [shopId]: on };
  write(AUTO_KEY, autoOffer);
  emit();
}

export function useShopOnline(shopId: string): boolean {
  return useSyncExternalStore(subscribe, () => flag(online, shopId, true));
}

export function setShopOnline(shopId: string, on: boolean) {
  online = { ...online, [shopId]: on };
  write(ONLINE_KEY, online);
  emit();
}

/** Drop sold-out, auto-offer, and online flags stored for the store screens. */
export function clearShopLocal() {
  soldOut = [];
  autoOffer = {};
  online = {};
  try {
    localStorage.removeItem(SOLD_KEY);
    localStorage.removeItem(AUTO_KEY);
    localStorage.removeItem(ONLINE_KEY);
  } catch {
    /* Private mode: the in-memory flags are already cleared. */
  }
  emit();
}
