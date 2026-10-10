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

export function setMe(userId: string) {
  me = userId;
  try {
    localStorage.setItem(KEY, userId);
  } catch {
    /* Private mode: keep it for this tab only. */
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
