import { useSyncExternalStore } from "react";

/** Customer or store, chosen once at account creation. A store never gets tealink.user_id. */

const ROLE_KEY = "tealink.role";
const SHOP_KEY = "tealink.shop_id";

export type Role = "customer" | "store";

function readRole(): Role | null {
  try {
    const value = localStorage.getItem(ROLE_KEY);
    return value === "customer" || value === "store" ? value : null;
  } catch {
    return null;
  }
}

function readShopId(): string | null {
  try {
    return localStorage.getItem(SHOP_KEY);
  } catch {
    return null;
  }
}

let role = readRole();
let shopId = readShopId();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRole(): Role | null {
  return role;
}

export function setRole(next: Role) {
  role = next;
  try {
    localStorage.setItem(ROLE_KEY, next);
  } catch {
    /* Private mode: keep it for this tab only. */
  }
  emit();
}

export function useRole(): Role | null {
  return useSyncExternalStore(subscribe, getRole);
}

export function getShopId(): string | null {
  return shopId;
}

export function setShopId(next: string) {
  shopId = next;
  try {
    localStorage.setItem(SHOP_KEY, next);
  } catch {
    /* Private mode: keep it for this tab only. */
  }
  emit();
}

/** Forget the customer-or-store choice and the selected shop. */
export function clearRole() {
  role = null;
  shopId = null;
  try {
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(SHOP_KEY);
  } catch {
    /* Private mode: the in-memory choice is already cleared. */
  }
  emit();
}

export function useShopId(): string | null {
  return useSyncExternalStore(subscribe, getShopId);
}
