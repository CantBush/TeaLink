import { useSyncExternalStore } from "react";

/** Who is using the app. No real accounts: the id lives in localStorage, and the demo runs as Andrew. */

const KEY = "tealink.user_id";
export const DEMO_USER = "andrew";

function read(): string {
  try {
    return localStorage.getItem(KEY) || DEMO_USER;
  } catch {
    return DEMO_USER;
  }
}

let me = read();
const listeners = new Set<() => void>();

export function getMe(): string {
  return me;
}

/** False until this browser has picked an account (signed up, or chose the demo account). */
export function hasChosenAccount(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return true;
  }
}

export function setMe(userId: string) {
  me = userId;
  try {
    localStorage.setItem(KEY, userId);
  } catch {
    /* Private mode: keep it for this tab only. */
  }
  listeners.forEach((listener) => listener());
}

/** Forget the signed-in user. The in-memory id falls back to the demo user, but nothing is stored. */
export function clearMe() {
  me = DEMO_USER;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Private mode: the in-memory id is already cleared. */
  }
  listeners.forEach((listener) => listener());
}

export function useMe(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getMe,
  );
}
