import { useSyncExternalStore } from "react";
import { apiBase } from "./client.ts";

/** The API is down, or doesn't serve this route yet. Callers fall back to an in-browser mock. */
export class Unavailable extends Error {}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Unavailable(path);
  }
  if (!response.ok) {
    const detail = ((await response.json().catch(() => null)) as { detail?: unknown } | null)?.detail;
    // FastAPI answers an unknown route with exactly "Not Found".
    if (response.status === 405 || (response.status === 404 && detail === "Not Found")) throw new Unavailable(path);
    throw new Error(typeof detail === "string" ? detail : `${path} failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

let preview = false;
const listeners = new Set<() => void>();

function setPreview(value: boolean) {
  if (preview === value) return;
  preview = value;
  listeners.forEach((listener) => listener());
}

/** True while the store tools are running on the in-browser mock. */
export function useStorePreview(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => preview,
  );
}

export async function withFallback<T>(live: () => Promise<T>, mock: () => T | Promise<T>): Promise<T> {
  try {
    const result = await live();
    setPreview(false);
    return result;
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
    setPreview(true);
    return mock();
  }
}
