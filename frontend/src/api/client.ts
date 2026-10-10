import type { LensEvent, RecommendRequest, TasteProfile } from "./types.ts";

function apiBase(): string {
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

export const client = {
  recommend,
  getProfile,
  setSoldOut,
  setPreference,
};
