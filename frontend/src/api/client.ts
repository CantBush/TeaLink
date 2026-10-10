import type {
  DrinkListing,
  EvalResult,
  Health,
  LensEvent,
  PreferenceReport,
  RecommendRequest,
  ShopListing,
  SimilarUser,
  TasteProfile,
} from "./types.ts";

export function apiBase(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (typeof configured === "string" && configured.trim()) {
    return configured.replace(/\/$/, "");
  }
  return "http://localhost:8000";
}

function parseFrame(frame: string): LensEvent | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n")
    .trim();
  if (!data || data === "[DONE]") return null;
  return JSON.parse(data) as LensEvent;
}

/**
 * POST /recommend and read an SSE stream.
 * Each event is a `data: {LensEvent}` frame terminated by a blank line.
 */
export async function recommend(
  body: RecommendRequest,
  onEvent: (event: LensEvent) => void,
): Promise<void> {
  const response = await fetch(`${apiBase()}/recommend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    throw new Error(`recommend failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consume = (chunk: string, flush: boolean) => {
    buffer += chunk.replace(/\r\n/g, "\n");
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = parseFrame(frame);
      if (event) onEvent(event);
    }
    if (flush && buffer.trim()) {
      const event = parseFrame(buffer);
      buffer = "";
      if (event) onEvent(event);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      consume(decoder.decode(), true);
      break;
    }
    consume(decoder.decode(value, { stream: true }), false);
  }
}

export async function getProfile(userId: string): Promise<TasteProfile> {
  const response = await fetch(
    `${apiBase()}/profile/${encodeURIComponent(userId)}`,
  );
  if (!response.ok) {
    throw new Error(`profile failed (${response.status})`);
  }
  return response.json() as Promise<TasteProfile>;
}

/** POST /events/sold-out with `{ drink_id }`. */
export async function setSoldOut(drinkId: string): Promise<void> {
  const response = await fetch(`${apiBase()}/events/sold-out`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drink_id: drinkId }),
  });
  if (!response.ok) {
    throw new Error(`sold-out failed (${response.status})`);
  }
}

/** POST /events/preference with `{ user_id, preference_overrides }`. */
export async function setPreference(
  userId: string,
  overrides: Record<string, number>,
): Promise<void> {
  const response = await fetch(`${apiBase()}/events/preference`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      preference_overrides: overrides,
    }),
  });
  if (!response.ok) {
    throw new Error(`preference failed (${response.status})`);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path} failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

/** POST /choices: the user picked one of the top 3; returns what the Preference agent learned. */
export function choose(userId: string, drinkId: string): Promise<PreferenceReport> {
  return post<PreferenceReport>("/choices", { user_id: userId, drink_id: drinkId });
}

export async function getPreferences(userId: string): Promise<PreferenceReport> {
  const response = await fetch(`${apiBase()}/preferences/${encodeURIComponent(userId)}`);
  if (!response.ok) {
    throw new Error(`preferences failed (${response.status})`);
  }
  return response.json() as Promise<PreferenceReport>;
}

export async function getSimilar(userId: string): Promise<SimilarUser[]> {
  const response = await fetch(`${apiBase()}/users/similar?user_id=${encodeURIComponent(userId)}`);
  if (!response.ok) {
    throw new Error(`similar failed (${response.status})`);
  }
  const body = (await response.json()) as { users: SimilarUser[] };
  return body.users;
}

export async function getDrinks(): Promise<DrinkListing[]> {
  const response = await fetch(`${apiBase()}/drinks`);
  if (!response.ok) {
    throw new Error(`drinks failed (${response.status})`);
  }
  return response.json() as Promise<DrinkListing[]>;
}

export async function getShops(): Promise<ShopListing[]> {
  const response = await fetch(`${apiBase()}/shops`);
  if (!response.ok) {
    throw new Error(`shops failed (${response.status})`);
  }
  return response.json() as Promise<ShopListing[]>;
}

export async function getHealth(): Promise<Health> {
  const response = await fetch(`${apiBase()}/health`);
  if (!response.ok) {
    throw new Error(`health failed (${response.status})`);
  }
  return response.json() as Promise<Health>;
}

export async function getEval(): Promise<EvalResult> {
  const response = await fetch(`${apiBase()}/eval`);
  if (!response.ok) {
    throw new Error(`eval failed (${response.status})`);
  }
  return response.json() as Promise<EvalResult>;
}

export function shopJoin(shopId: string): Promise<unknown> {
  return post("/events/shop-join", { shop_id: shopId });
}

export function shopOffline(shopId: string): Promise<unknown> {
  return post("/events/shop-offline", { shop_id: shopId });
}

export function resetDemo(): Promise<unknown> {
  return post("/events/reset", {});
}

export const client = {
  recommend,
  getProfile,
  setSoldOut,
  setPreference,
  choose,
  getPreferences,
  getSimilar,
  getEval,
  getDrinks,
  getShops,
  getHealth,
  shopJoin,
  shopOffline,
  resetDemo,
};
