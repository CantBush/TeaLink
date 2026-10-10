import type {
  Author,
  BobaStats,
  FeedComment,
  DimensionScores,
  FeedItem,
  ProfilePatch,
  QuizAnswers,
  QuizQuestion,
  QuizResult,
  TasteAttribute,
  TasteProfile,
  UserProfile,
} from "../api/types.ts";
import feedRaw from "./social/feed.json";
import personalityRaw from "./social/personality.json";
import profilesRaw from "./social/profiles.json";
import quizRaw from "./social/quiz.json";

/**
 * In-browser stand-in for Track A's social endpoints (contract in docs/PLAN.md),
 * so the social screens work before the API ships them. Changes persist in localStorage.
 */

interface StoredUser extends Omit<UserProfile, "followers" | "following" | "followed_by_me" | "taste_match" | "stats"> {
  following: string[];
  taste: TasteProfile;
  stats: BobaStats;
}

interface StoredFeedItem extends Omit<FeedItem, "likes" | "liked_by_me" | "author" | "to_author" | "comments"> {
  liked_by: string[];
  comments: Omit<FeedComment, "author">[];
}

interface Store {
  users: StoredUser[];
  feed: StoredFeedItem[];
}

const KEY = "tealink.social.v1";
const ATTRS: TasteAttribute[] = ["sweetness", "milkiness", "tea_intensity", "fruitiness", "toppings"];
const personality = personalityRaw as {
  means: TasteProfile;
  notes: Record<string, string>;
  traits: Record<TasteAttribute, string>;
};

function seed(): Store {
  return structuredClone({
    users: profilesRaw as unknown as StoredUser[],
    feed: feedRaw as unknown as StoredFeedItem[],
  });
}

function load(): Store {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return JSON.parse(saved) as Store;
  } catch {
    /* Fall back to the seed. */
  }
  return seed();
}

let store = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* Storage full or blocked: keep the in-memory copy. */
  }
}

export function resetSocialMock() {
  store = seed();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Nothing saved. */
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function similarity(a: TasteProfile, b: TasteProfile): number {
  const distance = ATTRS.reduce((sum, attr) => sum + Math.abs(a[attr] - b[attr]), 0) / ATTRS.length;
  return round(1 - distance);
}

function find(idOrHandle: string): StoredUser {
  const key = idOrHandle.toLowerCase().replace(/^@/, "");
  const user = store.users.find((item) => item.user_id === key || item.handle.toLowerCase() === key);
  if (!user) throw new Error(`No user ${idOrHandle}`);
  return user;
}

function view(user: StoredUser, viewerId: string): UserProfile {
  const own = user.user_id === viewerId;
  const viewer = store.users.find((item) => item.user_id === viewerId);
  const stats: Partial<BobaStats> = own ? { ...user.stats } : { personality: user.stats.personality };
  if (!own) {
    const keyed: Record<string, (keyof BobaStats)[]> = {
      fav_drink: ["fav_drink_id"],
      fav_shop: ["fav_shop_id"],
      sweetness: ["sweetness"],
      toppings: ["toppings"],
      milk_vs_fruit: ["milk_vs_fruit"],
      tried_count: ["tried_count"],
      shops_visited: ["shops_visited"],
      streak: ["streak_weeks"],
      top_notes: ["top_notes"],
      priorities: ["priorities"],
    };
    for (const stat of user.visible_stats) {
      for (const field of keyed[stat] ?? []) Object.assign(stats, { [field]: user.stats[field] });
    }
  }
  const { following, taste: _taste, stats: _stats, ...rest } = user;
  return {
    ...rest,
    followers: store.users.filter((item) => item.following.includes(user.user_id)).length,
    following: following.length,
    followed_by_me: viewer?.following.includes(user.user_id) ?? false,
    taste_match: own || !viewer ? null : similarity(viewer.taste, user.taste),
    stats,
  };
}

function author(userId: string): Author {
  const user = store.users.find((item) => item.user_id === userId);
  return user
    ? { handle: user.handle, display_name: user.display_name, avatar: user.avatar }
    : { handle: userId, display_name: userId, avatar: { emoji: "🧋", color: "#f0e2d0" } };
}

function feedView(item: StoredFeedItem, viewerId: string): FeedItem {
  const { liked_by, comments, ...rest } = item;
  return {
    ...rest,
    author: author(item.user_id),
    to_author: item.to_user_id ? author(item.to_user_id) : undefined,
    comments: comments.map((comment) => ({ ...comment, author: author(comment.user_id) })),
    likes: liked_by.length,
    liked_by_me: liked_by.includes(viewerId),
  };
}

function feedItem(id: string): StoredFeedItem {
  const item = store.feed.find((entry) => entry.id === id);
  if (!item) throw new Error(`No feed item ${id}`);
  return item;
}

export const socialMock = {
  getQuiz(): QuizQuestion[] {
    return quizRaw as QuizQuestion[];
  },

  createUser(handle: string, displayName: string): UserProfile {
    const clean = handle.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "");
    if (!clean) throw new Error("Pick a handle with letters or numbers.");
    if (store.users.some((user) => user.handle === clean || user.user_id === clean)) {
      throw new Error(`@${clean} is taken.`);
    }
    const user: StoredUser = {
      user_id: clean,
      handle: clean,
      display_name: displayName.trim() || clean,
      bio: "",
      avatar: { emoji: "🧋", color: "#f3d9b1" },
      accent: "#c4742a",
      pinned_drink_id: null,
      pinned_shop_id: null,
      visible_stats: ["sweetness", "milk_vs_fruit", "toppings", "top_notes", "priorities"],
      following: [],
      taste: { ...personality.means },
      stats: emptyStats(),
    };
    store.users.push(user);
    store.feed.unshift({
      id: `f_join_${clean}_${Date.now()}`,
      user_id: clean,
      kind: "joined",
      drink_id: null,
      rating: null,
      text: null,
      created_at: new Date().toISOString(),
      liked_by: [],
      comments: [],
    });
    save();
    return view(user, clean);
  },

  submitQuiz(userId: string, answers: QuizAnswers): QuizResult {
    const user = find(userId);
    const { taste, stats, weights } = scoreQuiz(answers);
    user.taste = taste;
    user.stats = { ...user.stats, ...stats };
    save();
    return { user_id: user.user_id, personality: user.stats.personality, stats: user.stats, weights };
  },

  listUsers(viewerId: string): UserProfile[] {
    return store.users
      .filter((user) => user.user_id !== viewerId)
      .map((user) => view(user, viewerId))
      .sort((a, b) => (b.taste_match ?? 0) - (a.taste_match ?? 0));
  },

  getUser(idOrHandle: string, viewerId: string): UserProfile {
    return view(find(idOrHandle), viewerId);
  },

  patchUser(userId: string, patch: ProfilePatch): UserProfile {
    const user = find(userId);
    Object.assign(user, patch);
    save();
    return view(user, userId);
  },

  follow(userId: string, viewerId: string, on: boolean): UserProfile {
    const user = find(userId);
    const viewer = find(viewerId);
    viewer.following = viewer.following.filter((id) => id !== user.user_id);
    if (on) viewer.following.push(user.user_id);
    save();
    return view(user, viewerId);
  },

  getFeed(viewerId: string): FeedItem[] {
    const viewer = store.users.find((user) => user.user_id === viewerId);
    const circle = new Set([viewerId, ...(viewer?.following ?? [])]);
    return store.feed
      .filter((item) => circle.has(item.user_id) || item.to_user_id === viewerId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((item) => feedView(item, viewerId));
  },

  getUserFeed(idOrHandle: string, viewerId: string): FeedItem[] {
    const user = find(idOrHandle);
    return store.feed
      .filter((item) => item.user_id === user.user_id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((item) => feedView(item, viewerId));
  },

  like(itemId: string, viewerId: string, on: boolean): FeedItem {
    const item = feedItem(itemId);
    item.liked_by = item.liked_by.filter((id) => id !== viewerId);
    if (on) item.liked_by.push(viewerId);
    save();
    return feedView(item, viewerId);
  },

  comment(itemId: string, viewerId: string, text: string): FeedItem {
    const item = feedItem(itemId);
    item.comments.push({
      id: `c_${Date.now()}`,
      user_id: viewerId,
      text: text.trim(),
      created_at: new Date().toISOString(),
    });
    save();
    return feedView(item, viewerId);
  },

  sendRec(from: string, to: string, drinkId: string, text: string): FeedItem {
    const item: StoredFeedItem = {
      id: `f_rec_${Date.now()}`,
      user_id: from,
      kind: "rec",
      drink_id: drinkId,
      rating: null,
      text: text.trim() || null,
      to_user_id: to,
      created_at: new Date().toISOString(),
      liked_by: [],
      comments: [],
    };
    store.feed.unshift(item);
    save();
    return feedView(item, from);
  },
};

function emptyStats(): BobaStats {
  return {
    fav_drink_id: null,
    fav_shop_id: null,
    sweetness: personality.means.sweetness,
    toppings: personality.means.toppings,
    milk_vs_fruit: 0.5,
    tried_count: 0,
    shops_visited: 0,
    streak_weeks: 0,
    top_notes: [],
    priorities: { taste: 0.4, cost: 0.25, novelty: 0.2, social: 0.15 },
    personality: "Classic Sipper",
  };
}

const SWEETNESS: Record<string, number> = { "0": 0.1, "25": 0.35, "50": 0.6, "100": 0.9 };
const BASES: Record<string, Pick<TasteProfile, "milkiness" | "fruitiness" | "tea_intensity">> = {
  milk: { milkiness: 0.85, fruitiness: 0.1, tea_intensity: 0.45 },
  fruit: { milkiness: 0.2, fruitiness: 0.8, tea_intensity: 0.4 },
  tea: { milkiness: 0.3, fruitiness: 0.15, tea_intensity: 0.85 },
};
const TOPPINGS: Record<string, number> = { none: 0.1, some: 0.55, loaded: 0.9 };
const COST: Record<string, number> = { low: 0.35, mid: 0.2, high: 0.05 };
const NOVELTY: Record<string, number> = { same: 0.05, sometimes: 0.2, always: 0.35 };

/** Preview of Track A's quiz mapping. The real numbers come from POST /quiz. */
function scoreQuiz(answers: QuizAnswers): { taste: TasteProfile; stats: Partial<BobaStats>; weights: DimensionScores } {
  const first = (id: string) => answers[id]?.[0] ?? "";
  const base = BASES[first("base")] ?? BASES.milk;
  const taste: TasteProfile = {
    sweetness: SWEETNESS[first("sweetness")] ?? 0.6,
    toppings: TOPPINGS[first("toppings")] ?? 0.55,
    ...base,
  };
  const raw: DimensionScores = {
    taste: 0.45,
    cost: COST[first("budget")] ?? 0.2,
    novelty: NOVELTY[first("adventure")] ?? 0.2,
    social: 0.15,
  };
  const total = raw.taste + raw.cost + raw.novelty + raw.social;
  const weights: DimensionScores = {
    taste: round(raw.taste / total),
    cost: round(raw.cost / total),
    novelty: round(raw.novelty / total),
    social: round(raw.social / total),
  };
  const notes = (answers.flavors ?? []).slice(0, 3);
  const top = ATTRS.reduce((best, attr) =>
    taste[attr] - personality.means[attr] > taste[best] - personality.means[best] ? attr : best,
  );
  return {
    taste,
    weights,
    stats: {
      sweetness: taste.sweetness,
      toppings: taste.toppings,
      milk_vs_fruit: round(taste.milkiness / Math.max(taste.milkiness + taste.fruitiness, 0.01)),
      top_notes: notes,
      priorities: weights,
      personality: `${personality.notes[notes[0]] ?? "Classic"} ${personality.traits[top]}`,
    },
  };
}
