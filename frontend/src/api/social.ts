import { useSyncExternalStore } from "react";
import { socialMock } from "../mocks/socialStore.ts";
import { apiBase } from "./client.ts";
import type { FeedItem, Notifications, PostInput, ProfilePatch, QuizAnswers, QuizQuestion, QuizResult, UserProfile } from "./types.ts";

/**
 * Social-layer calls (contract in docs/PLAN.md). Each one tries Track A's endpoint first and
 * falls back to the in-browser mock when the API is down or doesn't serve that route yet.
 */

class Unavailable extends Error {}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

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
      credentials: "include",
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
    throw new HttpError(response.status, typeof detail === "string" ? detail : `${path} failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
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

const hidePicks = (items: FeedItem[]) => items.filter((item) => item.kind !== "pick");

/**
 * An API without the bestea and post routes leaves those to the mock, so its profiles and feeds
 * need the mock's half merged in. A server that has the routes returns the fields and is untouched.
 */
function withMockBestea(profile: UserProfile, viewer: string): UserProfile {
  if (profile.bestea !== undefined) return profile;
  try {
    const local = socialMock.getUser(profile.user_id, viewer);
    const showOrders = local.visible_stats.includes("past_orders") && !profile.visible_stats.includes("past_orders");
    return {
      ...profile,
      visible_stats: showOrders ? [...profile.visible_stats, "past_orders"] : profile.visible_stats,
      bestea: local.bestea,
      besteas: local.besteas,
      stats: { ...profile.stats, past_orders: profile.stats.past_orders ?? local.stats.past_orders },
    };
  } catch {
    return profile;
  }
}

function withMockPosts(items: FeedItem[], local: () => FeedItem[]): FeedItem[] {
  if (items.some((item) => item.kind === "post")) return items;
  let posts: FeedItem[];
  try {
    posts = local().filter((item) => item.kind === "post");
  } catch {
    return items;
  }
  if (posts.length === 0) return items;
  return [...posts, ...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
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
    withFallback(
      () => request<UserProfile[]>("GET", `/users?${q(viewer)}`).then((users) => users.map((user) => withMockBestea(user, viewer))),
      () => socialMock.listUsers(viewer),
    ),

  getUser: (handle: string, viewer: string) =>
    withFallback(
      () => request<UserProfile>("GET", `/users/${id(handle)}?${q(viewer)}`).then((user) => withMockBestea(user, viewer)),
      () => socialMock.getUser(handle, viewer),
    ),

  patchUser: (userId: string, patch: ProfilePatch) =>
    withFallback(
      () =>
        request<UserProfile>("PATCH", `/users/${id(userId)}`, patch)
          .catch((error: unknown) => {
            // An API from before "past_orders" rejects the key; keep that one choice in the mock.
            if (!(error instanceof HttpError && error.status === 422 && patch.visible_stats?.includes("past_orders"))) throw error;
            try {
              const local = socialMock.getUser(userId, userId);
              const rest = local.visible_stats.filter((key) => key !== "past_orders");
              socialMock.patchUser(userId, { visible_stats: [...rest, "past_orders"] });
            } catch {
              /* Not in the mock. */
            }
            return request<UserProfile>("PATCH", `/users/${id(userId)}`, {
              ...patch,
              visible_stats: patch.visible_stats.filter((key) => key !== "past_orders"),
            });
          })
          .then((user) => {
            if (patch.visible_stats && !patch.visible_stats.includes("past_orders")) {
              try {
                const local = socialMock.getUser(userId, userId);
                socialMock.patchUser(userId, { visible_stats: local.visible_stats.filter((key) => key !== "past_orders") });
              } catch {
                /* Not in the mock. */
              }
            }
            return withMockBestea(user, userId);
          }),
      () => socialMock.patchUser(userId, patch),
    ),

  follow: (userId: string, viewer: string, on: boolean) =>
    withFallback(
      () =>
        request<UserProfile>(on ? "POST" : "DELETE", `/users/${id(userId)}/follow`, { viewer }).then((user) =>
          withMockBestea(user, viewer),
        ),
      () => socialMock.follow(userId, viewer, on),
    ),

  getFeed: (viewer: string) =>
    withFallback(
      () => request<FeedItem[]>("GET", `/feed?user_id=${id(viewer)}`).then((items) => withMockPosts(items, () => socialMock.getFeed(viewer))),
      () => socialMock.getFeed(viewer),
    ).then(hidePicks),

  getUserFeed: (handle: string, viewer: string) =>
    withFallback(
      () =>
        request<FeedItem[]>("GET", `/feed?author=${id(handle)}&user_id=${id(viewer)}`).then((items) =>
          withMockPosts(items, () => socialMock.getUserFeed(handle, viewer)),
        ),
      () => socialMock.getUserFeed(handle, viewer),
    ).then(hidePicks),

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

  /** The API takes the author from the session; the mock needs `viewer`. */
  createPost: (viewer: string, input: PostInput) =>
    withFallback(
      () => request<FeedItem>("POST", "/posts", input),
      () => socialMock.createPost(viewer, input),
    ),

  deletePost: (viewer: string, itemId: string) =>
    withFallback(
      () => request<void>("DELETE", `/posts/${id(itemId)}`),
      () => socialMock.deletePost(viewer, itemId),
    ),

  /** `user` is a user id or handle, like /users/{ref}. */
  bestea: (viewer: string, user: string, action: "request" | "accept" | "decline" | "end") =>
    withFallback(
      () =>
        action === "end"
          ? request<UserProfile>("DELETE", `/bestea/${id(user)}`)
          : request<UserProfile>("POST", `/bestea/${id(user)}/${action}`),
      () => socialMock.bestea(viewer, user, action),
    ),

  notifications: (viewer: string) =>
    withFallback(
      () => request<Notifications>("GET", "/notifications"),
      () => socialMock.notifications(viewer),
    ),

  readNotifications: (viewer: string, ids?: string[]) =>
    withFallback(
      () => request<unknown>("POST", "/notifications/read", ids ? { ids } : {}),
      () => socialMock.readNotifications(viewer, ids),
    ),

  sendRec: (from: string, to: string, drinkId: string, text: string) =>
    withFallback(
      () => request<FeedItem>("POST", "/recs", { from, to, drink_id: drinkId, text }),
      () => socialMock.sendRec(from, to, drinkId, text),
    ),
};
