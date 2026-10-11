import { useSyncExternalStore } from "react";
import { paintAuthor, paintProfile } from "../lib/images.ts";
import { socialMock } from "../mocks/socialStore.ts";
import { apiBase } from "./client.ts";
import type { FeedComment, FeedItem, Notifications, PostInput, ProfilePatch, QuizAnswers, QuizQuestion, QuizResult, UserProfile } from "./types.ts";

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

const followerCache = new Map<string, Promise<Set<string> | null>>();

/** Who follows `viewer`. Null when that route is not served yet. */
function followerIds(viewer: string): Promise<Set<string> | null> {
  const cached = followerCache.get(viewer);
  if (cached) return cached;
  const pending = request<{ users: { user_id?: string }[] }>("GET", `/users/${id(viewer)}/followers?${q(viewer)}`)
    .then((data) => new Set(data.users.map((user) => user.user_id).filter((userId): userId is string => Boolean(userId))))
    .catch((error: unknown) => {
      followerCache.delete(viewer);
      if (error instanceof Unavailable) return null;
      return new Set<string>();
    });
  followerCache.set(viewer, pending);
  return pending;
}

async function withFollowsMe(users: UserProfile[], viewer: string): Promise<UserProfile[]> {
  const painted = users.map((user) => paintProfile(user));
  if (!viewer || painted.every((user) => user.follows_me !== undefined || user.user_id === viewer)) return painted;
  const ids = await followerIds(viewer);
  if (!ids) return painted;
  return painted.map((user) => (user.follows_me !== undefined ? user : { ...user, follows_me: ids.has(user.user_id) }));
}

function paintComment(comment: FeedComment): FeedComment {
  return { ...comment, author: paintAuthor(comment.author) };
}

function paintFeed(items: FeedItem[]): FeedItem[] {
  return items.map((item) => ({
    ...item,
    author: paintAuthor(item.author),
    to_author: item.to_author ? paintAuthor(item.to_author) : item.to_author,
    comments: item.comments.map(paintComment),
  }));
}

function paintNotes(data: Notifications): Notifications {
  return { ...data, items: data.items.map((note) => ({ ...note, from: paintAuthor(note.from) })) };
}

/** Rec notifications live in the mock until the API writes them. */
function withMockRecs(data: Notifications, viewer: string): Notifications {
  if (data.items.some((item) => item.kind === "rec")) return paintNotes(data);
  let extra: Notifications["items"] = [];
  try {
    extra = socialMock.notifications(viewer).items.filter((item) => item.kind === "rec");
  } catch {
    return paintNotes(data);
  }
  if (extra.length === 0) return paintNotes(data);
  const items = [...extra, ...data.items].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return paintNotes({ items, unread: items.filter((item) => !item.read).length });
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
      () =>
        request<UserProfile[]>("GET", `/users?${q(viewer)}`).then((users) =>
          withFollowsMe(
            users.map((user) => withMockBestea(user, viewer)),
            viewer,
          ),
        ),
      () => socialMock.listUsers(viewer).map((user) => paintProfile(user)),
    ),

  getUser: (handle: string, viewer: string) =>
    withFallback(
      () =>
        request<UserProfile>("GET", `/users/${id(handle)}?${q(viewer)}`).then(async (user) => {
          const [painted] = await withFollowsMe([withMockBestea(user, viewer)], viewer);
          return painted;
        }),
      () => paintProfile(socialMock.getUser(handle, viewer)),
    ),

  patchUser: (userId: string, patch: ProfilePatch) =>
    withFallback(
      () =>
        request<UserProfile>("PATCH", `/users/${id(userId)}`, patch)
          .catch((error: unknown) => {
            if (!(error instanceof HttpError) || error.status !== 422) throw error;
            // Picture fields are new. An API that doesn't store them yet still saves the rest.
            const withoutPictures: ProfilePatch = {
              ...patch,
              cover_url: undefined,
              avatar: patch.avatar ? { emoji: patch.avatar.emoji, color: patch.avatar.color } : patch.avatar,
            };
            const sentPictures = patch.cover_url !== undefined || patch.avatar?.photo_url !== undefined;
            const retry = (body: ProfilePatch) => request<UserProfile>("PATCH", `/users/${id(userId)}`, body);
            const afterPictures = sentPictures ? retry(withoutPictures) : Promise.reject(error);
            return afterPictures.catch((again: unknown) => {
              const body = sentPictures ? withoutPictures : patch;
              if (!(again instanceof HttpError && again.status === 422 && body.visible_stats?.includes("past_orders"))) throw again;
              try {
                const local = socialMock.getUser(userId, userId);
                const rest = local.visible_stats.filter((key) => key !== "past_orders");
                socialMock.patchUser(userId, { visible_stats: [...rest, "past_orders"] });
              } catch {
                /* Not in the mock. */
              }
              return retry({
                ...body,
                visible_stats: body.visible_stats?.filter((key) => key !== "past_orders"),
              });
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
            return paintProfile(withMockBestea(user, userId));
          }),
      () => paintProfile(socialMock.patchUser(userId, patch)),
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
    )
      .then(hidePicks)
      .then(paintFeed),

  getUserFeed: (handle: string, viewer: string) =>
    withFallback(
      () =>
        request<FeedItem[]>("GET", `/feed?author=${id(handle)}&user_id=${id(viewer)}`).then((items) =>
          withMockPosts(items, () => socialMock.getUserFeed(handle, viewer)),
        ),
      () => socialMock.getUserFeed(handle, viewer),
    )
      .then(hidePicks)
      .then(paintFeed),

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
      () => request<Notifications>("GET", "/notifications").then((data) => withMockRecs(data, viewer)),
      () => paintNotes(socialMock.notifications(viewer)),
    ),

  readNotifications: (viewer: string, ids?: string[]) =>
    withFallback(
      () =>
        request<unknown>("POST", "/notifications/read", ids ? { ids } : {}).then((result) => {
          try {
            socialMock.readNotifications(viewer, ids);
          } catch {
            /* The mock has nothing for this account. */
          }
          return result;
        }),
      () => socialMock.readNotifications(viewer, ids),
    ),

  sendRec: (from: string, to: string, drinkId: string, text: string) =>
    withFallback(
      () =>
        request<FeedItem>("POST", "/recs", { from, to, drink_id: drinkId, text }).then((item) => {
          try {
            socialMock.sendRec(from, to, drinkId, text);
          } catch {
            /* The live API already accepted it. The mock only mirrors the notification. */
          }
          return paintFeed([item])[0];
        }),
      () => socialMock.sendRec(from, to, drinkId, text),
    ),
};
