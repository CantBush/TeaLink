// Builds the social-layer mocks in src/mocks/social/ from the backend seed data,
// so the preview uses the same users, drinks, and reviews as the real API.
// Usage: node scripts/build-social-mocks.mjs   (re-run after the backend re-seeds)
// The stats here are a preview only; Track A's GET /users/{id} is the source of truth.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const DATA = new URL("../../backend/data/", import.meta.url);
const OUT = new URL("../src/mocks/social/", import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(name, DATA), "utf8"));

const users = read("users.json");
const drinks = read("drinks.json");
const reviews = read("reviews.json");
const session = JSON.parse(readFileSync(new URL("../src/mocks/sample_session.json", import.meta.url), "utf8"));

const drinkById = Object.fromEntries(drinks.map((drink) => [drink.id, drink]));
const ATTRS = ["sweetness", "milkiness", "tea_intensity", "fruitiness", "toppings"];
const EMOJIS = ["🧋", "🍵", "🐯", "🌸", "🍓", "🥭", "🍑", "🫖", "🍯", "🐼", "🦊", "🐻", "🍡", "🌙", "⭐"];
const COLORS = ["#f3d9b1", "#d8e8c8", "#f6c9c0", "#e3d4f0", "#cfe3ef", "#f9e3a6", "#e8cfc0", "#d5ebe0"];
const ACCENTS = ["#c4742a", "#7a9a5b", "#c0605a", "#8b6bb0", "#4d86a8", "#b8892a"];
const ANCHOR = Date.parse("2026-10-10T12:00:00-07:00");

function hash(text) {
  let value = 7;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) % 100003;
  return value;
}

const round = (value) => Math.round(value * 100) / 100;

function tasteOf(userId) {
  const mine = reviews.filter((review) => review.user_id === userId && drinkById[review.drink_id]);
  const profile = Object.fromEntries(ATTRS.map((attr) => [attr, 0]));
  let total = 0;
  for (const review of mine) {
    const weight = Math.max(review.rating - 2, 0);
    total += weight;
    for (const attr of ATTRS) profile[attr] += weight * drinkById[review.drink_id].attributes[attr];
  }
  for (const attr of ATTRS) profile[attr] = round(total ? profile[attr] / total : 0.5);
  return profile;
}

function similarity(a, b) {
  const distance = ATTRS.reduce((sum, attr) => sum + Math.abs(a[attr] - b[attr]), 0) / ATTRS.length;
  return round(1 - distance);
}

const NOTE_NAMES = {
  brown_sugar: "Brown Sugar",
  oolong: "Oolong",
  matcha: "Matcha",
  taro: "Taro",
  thai_tea: "Thai Tea",
  hojicha: "Roasted",
  jasmine: "Floral",
  fruit: "Tropical",
};

const TRAITS = {
  sweetness: "Sweet Tooth",
  milkiness: "Cream Dreamer",
  tea_intensity: "Tea Purist",
  fruitiness: "Fruit Chaser",
  toppings: "Topping Lover",
};

/** "Brown Sugar" + the attribute furthest above the average user. src/mocks/socialStore.ts applies the same rule from personality.json. */
function personality(notes, taste, means) {
  const lead = NOTE_NAMES[notes[0]] ?? "Classic";
  const top = ATTRS.reduce((best, attr) => (taste[attr] - means[attr] > taste[best] - means[best] ? attr : best));
  return `${lead} ${TRAITS[top]}`;
}

function priorities(userId, index) {
  const decision = session.events.find((event) => event.type === "decision")?.payload;
  if (userId === "andrew" && decision?.weights) return decision.weights;
  const raw = { taste: 0.4 + (index % 3) * 0.05, cost: 0.15 + (index % 4) * 0.05, novelty: 0.1 + (index % 5) * 0.04, social: 0.12 };
  const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, round(value / total)]));
}

function statsOf(userId, index) {
  const mine = reviews.filter((review) => review.user_id === userId && drinkById[review.drink_id]);
  const liked = mine.filter((review) => review.rating >= 4);
  const best = [...mine].sort((a, b) => b.rating - a.rating)[0];
  const shopCounts = {};
  const noteCounts = {};
  for (const review of liked) {
    const drink = drinkById[review.drink_id];
    shopCounts[drink.shop_id] = (shopCounts[drink.shop_id] ?? 0) + 1;
    for (const tag of drink.flavor_tags) noteCounts[tag] = (noteCounts[tag] ?? 0) + 1;
  }
  const taste = tasteOf(userId);
  const notes = Object.entries(noteCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);
  const shopsVisited = new Set(mine.map((review) => drinkById[review.drink_id].shop_id)).size;
  return {
    fav_drink_id: best?.drink_id ?? null,
    fav_shop_id: Object.entries(shopCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    sweetness: taste.sweetness,
    toppings: taste.toppings,
    milk_vs_fruit: round(taste.milkiness / Math.max(taste.milkiness + taste.fruitiness, 0.01)),
    tried_count: new Set(mine.map((review) => review.drink_id)).size,
    shops_visited: shopsVisited,
    streak_weeks: (hash(userId) % 6) + 1,
    top_notes: notes,
    priorities: priorities(userId, index),
    personality: personality(notes, taste, MEANS),
  };
}

const DEFAULT_STATS = ["fav_drink", "fav_shop", "sweetness", "milk_vs_fruit", "toppings", "top_notes", "tried_count", "shops_visited", "streak"];
const HIDDEN = { owen: ["streak", "shops_visited"], sam: ["fav_shop"], rina: ["sweetness"] };

const tastes = Object.fromEntries(users.map((user) => [user.id, tasteOf(user.id)]));
const MEANS = Object.fromEntries(
  ATTRS.map((attr) => [attr, round(users.reduce((sum, user) => sum + tastes[user.id][attr], 0) / users.length)]),
);

const profiles = users.map((user, index) => {
  const stats = statsOf(user.id, index);
  const following = users
    .filter((other) => other.id !== user.id)
    .map((other) => ({ id: other.id, score: similarity(tastes[user.id], tastes[other.id]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((other) => other.id);
  const visible = user.id === "andrew" ? [...DEFAULT_STATS, "priorities"] : DEFAULT_STATS.filter((key) => !(HIDDEN[user.id] ?? []).includes(key));
  return {
    user_id: user.id,
    handle: user.id,
    display_name: user.name,
    bio: user.persona,
    avatar: { emoji: EMOJIS[index % EMOJIS.length], color: COLORS[index % COLORS.length] },
    accent: ACCENTS[index % ACCENTS.length],
    pinned_drink_id: stats.fav_drink_id,
    pinned_shop_id: stats.fav_shop_id,
    visible_stats: visible,
    following,
    taste: tastes[user.id],
    stats,
  };
});

const followersOf = (userId) => profiles.filter((profile) => profile.following.includes(userId)).map((profile) => profile.user_id);

// Round-robin across users so the feed mixes people instead of listing one person's reviews in a row.
const byUser = users.map((user, index) => {
  const mine = reviews.filter((review) => review.user_id === user.id);
  const shift = index % Math.max(mine.length, 1);
  return [...mine.slice(shift), ...mine.slice(0, shift)];
});
const ordered = [];
for (let turn = 0; byUser.some((list) => list.length > turn); turn += 1) {
  for (const list of byUser) if (list[turn]) ordered.push(list[turn]);
}
const COMMENTS = ["Adding this to my list!", "Was it too sweet?", "Same order every time 😄", "Need to try this", "Agreed, so good"];
const feed = ordered.map((review, index) => {
  const fans = followersOf(review.user_id);
  const likedBy = fans.filter((fan) => hash(`${review.id}:${fan}`) % 3 !== 0);
  const comments =
    index % 4 === 0 && fans.length
      ? [
          {
            id: `c_${review.id}`,
            user_id: fans[hash(review.id) % fans.length],
            text: COMMENTS[index % COMMENTS.length],
            created_at: new Date(ANCHOR - index * 47 * 60000 + 20 * 60000).toISOString(),
          },
        ]
      : [];
  return {
    id: `f_${review.id}`,
    user_id: review.user_id,
    kind: "review",
    drink_id: review.drink_id,
    rating: review.rating,
    text: review.text,
    created_at: new Date(ANCHOR - index * 47 * 60000).toISOString(),
    liked_by: likedBy,
    comments,
  };
});

const catalog = drinks.map(({ id, name, shop_id, price, flavor_tags, attributes }) => ({
  id,
  name,
  shop_id,
  price,
  flavor_tags,
  attributes,
}));

const quiz = [
  {
    id: "sweetness",
    prompt: "How sweet do you like it?",
    options: [
      { id: "0", label: "Not sweet", emoji: "🍃" },
      { id: "25", label: "A little", emoji: "🌱" },
      { id: "50", label: "Half sweet", emoji: "🧋" },
      { id: "100", label: "Full sugar", emoji: "🍯" },
    ],
  },
  {
    id: "base",
    prompt: "Pick your base",
    options: [
      { id: "milk", label: "Creamy milk tea", emoji: "🥛" },
      { id: "fruit", label: "Fresh fruit tea", emoji: "🍓" },
      { id: "tea", label: "Strong, pure tea", emoji: "🍵" },
    ],
  },
  {
    id: "toppings",
    prompt: "Toppings?",
    options: [
      { id: "none", label: "None, just the drink", emoji: "🚫" },
      { id: "some", label: "Boba, always", emoji: "⚫" },
      { id: "loaded", label: "Load it up", emoji: "🍮" },
    ],
  },
  {
    id: "flavors",
    prompt: "Which flavors sound good? Pick any",
    multi: true,
    options: [
      { id: "brown_sugar", label: "Brown sugar", emoji: "🍯" },
      { id: "oolong", label: "Oolong", emoji: "🫖" },
      { id: "matcha", label: "Matcha", emoji: "🍵" },
      { id: "taro", label: "Taro", emoji: "💜" },
      { id: "thai_tea", label: "Thai tea", emoji: "🧡" },
      { id: "hojicha", label: "Roasted hojicha", emoji: "🔥" },
      { id: "jasmine", label: "Floral", emoji: "🌸" },
      { id: "fruit", label: "Fruity", emoji: "🥭" },
    ],
  },
  {
    id: "budget",
    prompt: "What's your usual budget?",
    options: [
      { id: "low", label: "Under $5", emoji: "🪙" },
      { id: "mid", label: "$5 to $6.50", emoji: "💵" },
      { id: "high", label: "Whatever it takes", emoji: "💎" },
    ],
  },
  {
    id: "adventure",
    prompt: "When you order, you…",
    options: [
      { id: "same", label: "Get my usual", emoji: "🔁" },
      { id: "sometimes", label: "Mix it up sometimes", emoji: "🎲" },
      { id: "always", label: "Always try something new", emoji: "🧭" },
    ],
  },
];

mkdirSync(OUT, { recursive: true });
const write = (name, value) => writeFileSync(new URL(name, OUT), `${JSON.stringify(value, null, 2)}\n`);
write("catalog.json", catalog);
write("profiles.json", profiles);
write("feed.json", feed);
write("quiz.json", quiz);
write("personality.json", { means: MEANS, notes: NOTE_NAMES, traits: TRAITS });
console.log(`Wrote ${profiles.length} profiles, ${feed.length} feed items, ${catalog.length} drinks, ${quiz.length} quiz questions.`);
