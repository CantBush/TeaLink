import { useSyncExternalStore } from "react";

/** The signed-in customer's user id, or "" when nobody is signed in. There is no default user. */

const KEY = "tealink.user_id";
export const DEMO_USER = "andrew";

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

let me = read();
const listeners = new Set<() => void>();

export function getMe(): string {
  return me;
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

/** Forget the signed-in user. */
export function clearMe() {
  me = "";
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
