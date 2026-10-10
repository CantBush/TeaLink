// Records a real session from a running API into src/mocks/sample_session.json,
// so the offline fallback shows what the live app shows.
// Usage: node scripts/capture-mock.mjs   (API on VITE_API_URL or http://localhost:8000)
// Resets the demo state on the API before and after.
import { writeFileSync } from "node:fs";

const API = (process.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
const USER = "andrew";
const OUT = new URL("../src/mocks/sample_session.json", import.meta.url);

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res;
}

async function recommend() {
  const res = await post("/recommend", {
    user_id: USER,
    query: "What should I get next?",
    preference_overrides: {},
  });
  const text = (await res.text()).replace(/\r\n/g, "\n");
  return text
    .split("\n\n")
    .map((frame) =>
      frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n"),
    )
    .filter((data) => data && data !== "[DONE]")
    .map((data) => JSON.parse(data));
}

const decisionOf = (events) => events.find((event) => event.type === "decision")?.payload;

await post("/events/reset", {});
const profile = await (await fetch(`${API}/profile/${USER}`)).json();
const first = await recommend();

await post("/events/shop-join", { shop_id: "lantern_leaf" });
const before = decisionOf(await recommend());

const change = "Andrew says he doesn't like brown sugar.";
await post("/events/preference", { user_id: USER, preference_overrides: { brown_sugar: 0 } });
const after = decisionOf(await recommend());

await post("/events/reset", {});

const session = { user_id: USER, profile, events: first, counterfactual: { change, before, after } };
writeFileSync(OUT, `${JSON.stringify(session, null, 2)}\n`);
console.log(`Wrote ${first.length} events, before=${before.drink_name}, after=${after.drink_name}`);
