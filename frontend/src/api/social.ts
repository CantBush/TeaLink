import { useSyncExternalStore } from "react";
import { socialMock } from "../mocks/socialStore.ts";
import { apiBase } from "./client.ts";
import type { FeedItem, ProfilePatch, QuizAnswers, QuizQuestion, QuizResult, UserProfile } from "./types.ts";

/**
 * Social-layer calls (contract in docs/PLAN.md). Each one tries Track A's endpoint first and
 * falls back to the in-browser mock when the API is down or doesn't serve that route yet.
 */

class Unavailable extends Error {}

let preview = false;
const listeners = new Set<() => void>();

function setPreview(value: boolean) {
  if (preview === value) return;
  preview = value;
  listeners.forEach((listener) => listener());
}

/** True while the social screens are running on the in-browser mock. */
export function useSocialPreview(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => preview,
  );
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Unavailable(path);
  }
  if (!response.ok) {
    const detail = ((await response.json().catch(() => null)) as { detail?: unknown } | null)?.detail;
    // FastAPI answers an unknown route with exactly "Not Found"; a missing user has its own message.
    const routeMissing = response.status === 405 || (response.status === 404 && detail === "Not Found");
    if (routeMissing) throw new Unavailable(path);
    throw new Error(typeof detail === "string" ? detail : `${path} failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

async function withFallback<T>(live: () => Promise<T>, mock: () => T): Promise<T> {
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

const q = (viewer: string) => `viewer=${encodeURIComponent(viewer)}`;
const id = (value: string) => encodeURIComponent(value);

export const social = {
  getQuiz: () => withFallback(() => request<QuizQuestion[]>("GET", "/quiz"), () => socialMock.getQuiz()),

  createUser: (handle: string, displayName: string) =>
    withFallback(
      () => request<UserProfile>("POST", "/users", { handle, display_name: displayName }),
      () => socialMock.createUser(handle, displayName),
    ),

  submitQuiz: (userId: string, answers: QuizAnswers) =>
    withFallback(
      () => request<QuizResult>("POST", "/quiz", { user_id: userId, answers }),
      () => socialMock.submitQuiz(userId, answers),
    ),

  listUsers: (viewer: string) =>
    withFallback(() => request<UserProfile[]>("GET", `/users?${q(viewer)}`), () => socialMock.listUsers(viewer)),

  getUser: (handle: string, viewer: string) =>
    withFallback(
      () => request<UserProfile>("GET", `/users/${id(handle)}?${q(viewer)}`),
      () => socialMock.getUser(handle, viewer),
    ),

  patchUser: (userId: string, patch: ProfilePatch) =>
    withFallback(
      () => request<UserProfile>("PATCH", `/users/${id(userId)}`, patch),
      () => socialMock.patchUser(userId, patch),
    ),

  follow: (userId: string, viewer: string, on: boolean) =>
    withFallback(
      () => request<UserProfile>(on ? "POST" : "DELETE", `/users/${id(userId)}/follow`, { viewer }),
      () => socialMock.follow(userId, viewer, on),
    ),

  getFeed: (viewer: string) =>
    withFallback(() => request<FeedItem[]>("GET", `/feed?user_id=${id(viewer)}`), () => socialMock.getFeed(viewer)),

  getUserFeed: (handle: string, viewer: string) =>
    withFallback(
      () => request<FeedItem[]>("GET", `/feed?author=${id(handle)}&user_id=${id(viewer)}`),
      () => socialMock.getUserFeed(handle, viewer),
    ),

  like: (itemId: string, viewer: string, on: boolean) =>
    withFallback(
      () => request<FeedItem>(on ? "POST" : "DELETE", `/feed/${id(itemId)}/like`, { viewer }),
      () => socialMock.like(itemId, viewer, on),
    ),

  comment: (itemId: string, viewer: string, text: string) =>
    withFallback(
      () => request<FeedItem>("POST", `/feed/${id(itemId)}/comments`, { viewer, text }),
      () => socialMock.comment(itemId, viewer, text),
    ),

  sendRec: (from: string, to: string, drinkId: string, text: string) =>
    withFallback(
      () => request<FeedItem>("POST", "/recs", { from, to, drink_id: drinkId, text }),
      () => socialMock.sendRec(from, to, drinkId, text),
    ),
};
