export type TasteAttribute =
  | "sweetness"
  | "milkiness"
  | "tea_intensity"
  | "fruitiness"
  | "toppings";

/** The five taste attributes, each a 0–1 number. */
export type TasteProfile = Record<TasteAttribute, number>;

/** What each objective agent argues for. Weights over these are learned per user. */
export type Dimension = "taste" | "social" | "novelty" | "cost";

export type DimensionScores = Record<Dimension, number>;

export interface Evidence {
  review_id: string;
  drink_name: string;
  rating: number;
  text: string;
  relevance: string;
}

export interface FactorContribution {
  factor: string;
  weight: number;
}

export interface Proposal {
  agent_id: string;
  drink_id: string;
  drink_name: string;
  shop_id: string;
  score: number;
  factors: FactorContribution[];
  evidence: Evidence[];
  rationale: string;
  price?: number;
  dimension?: Dimension | null;
}

export type ObjectionKind = "veto" | "concern" | "neutral" | "support";

export interface Objection {
  agent_id: string;
  target_drink_id: string;
  kind: ObjectionKind;
  reason: string;
  score?: number | null;
  dimension?: Dimension | null;
}

export interface AgentSelection {
  agent_id: string;
  capabilities: string[];
  reason: string;
  /** Planned in docs/PLAN.md "UI round 2"; the frontend falls back to its own copy until served. */
  name?: string;
  description?: string;
}

/** A shop's close-call discount. `percent` is whole, so 10 means 10% off. */
export interface Offer {
  shop_id: string;
  percent: number;
  price_after: number;
  reason: string;
}

export interface RankedDrink {
  drink_id: string;
  drink_name: string;
  score: number;
  shop_id?: string;
  /** Already `price_after` when an offer is set. */
  price?: number;
  dimension_scores?: DimensionScores;
  offer?: Offer | null;
}

export interface DroppedDrink {
  drink_id: string;
  drink_name: string;
  reason: string;
  by: string;
}

export interface Decision {
  drink_id: string;
  drink_name: string;
  shop_id: string;
  score: number;
  ask_human: boolean;
  question: string | null;
  alternatives: RankedDrink[];
  explanation: string;
  options?: RankedDrink[];
  weights?: DimensionScores;
  dropped?: DroppedDrink[];
  /** Planned: who settled it. Missing means the arbiter (single-round mode). */
  decided_by?: "agents" | "arbiter";
  /** Planned: rebuttal rounds that ran before the decision. */
  rounds?: number;
}

export interface PreferenceReport {
  user_id: string;
  weights: DimensionScores;
  previous_weights: DimensionScores | null;
  choices_seen: number;
  summary: string;
}

export interface SimilarUser {
  id: string;
  name: string;
  similarity: number;
}

export type LensEventType =
  | "selection"
  | "proposal"
  | "objection"
  | "decision"
  | "status"
  | "preference"
  | "offer";

export interface LensEvent {
  type: LensEventType;
  agent_id: string | null;
  message: string;
  /** Planned extras: `round` (1-based) and `revised_from` on objections that soften in a rebuttal. */
  payload: Record<string, unknown>;
  seq: number;
}

export type EvalMethodName = "popularity" | "fixed_weights" | "learning";

/** One recommender's results over the simulated users (GET /eval). */
export interface EvalMethod {
  method: EvalMethodName;
  /** Share of rounds where the team's #1 was the drink the user picked. */
  hit_rate: number;
  /** Share of rounds where the pick was anywhere in the top 3. */
  top3_rate: number;
  sold_out_recs: number;
  /** Share of recommendations the user had already tried. */
  repeat_rate: number;
}

export interface EvalPersona {
  name: string;
  hidden_weights: DimensionScores;
  learned_weights: DimensionScores;
}

export interface EvalResult {
  rounds: number;
  methods: EvalMethod[];
  personas: EvalPersona[];
}

/** GET /health. `effective` is what is actually answering: "pending" means AGNTCY is configured but not connected. */
export interface Health {
  status: string;
  transport: "local" | "agntcy";
  effective: "local" | "agntcy" | "pending";
  /** Replies received over the bus so far, per agent id. */
  remote_replies: Record<string, number>;
  /** Planned: "single" (one round + arbiter) or "dialogue" (rebuttal rounds). */
  deliberation?: "single" | "dialogue";
}

/* Social layer. Contract in docs/PLAN.md, "Social layer"; served by Track A, mocked in mocks/social/. */

export type StatKey =
  | "fav_drink"
  | "fav_shop"
  | "sweetness"
  | "toppings"
  | "milk_vs_fruit"
  | "tried_count"
  | "shops_visited"
  | "streak"
  | "top_notes"
  | "priorities";

export interface BobaStats {
  fav_drink_id: string | null;
  fav_shop_id: string | null;
  /** 0 = not sweet, 1 = very sweet. */
  sweetness: number;
  /** 0 = no toppings, 1 = loaded. */
  toppings: number;
  /** 0 = fruit, 1 = milk. */
  milk_vs_fruit: number;
  tried_count: number;
  shops_visited: number;
  streak_weeks: number;
  /** Flavor tags from drinks.json, e.g. ["brown_sugar", "oolong"]. */
  top_notes: string[];
  priorities: DimensionScores;
  personality: string;
}

export interface Avatar {
  emoji: string;
  color: string;
}

export interface UserProfile {
  user_id: string;
  handle: string;
  display_name: string;
  bio: string;
  avatar: Avatar;
  accent: string;
  pinned_drink_id: string | null;
  pinned_shop_id: string | null;
  /** Planned in docs/PLAN.md "UI round 2": the Boba card background, picked by you. */
  card_color?: string;
  /** In display order. Hidden stats are left out. */
  visible_stats: StatKey[];
  followers: number;
  following: number;
  followed_by_me: boolean;
  /** 0..1 against the viewer, null on your own profile. */
  taste_match: number | null;
  /** Other viewers only receive the visible stats. */
  stats: Partial<BobaStats>;
  /** Reserved for uploads; always null for now. */
  cover_url?: string | null;
}

export type ProfilePatch = Partial<
  Pick<UserProfile, "display_name" | "bio" | "avatar" | "accent" | "pinned_drink_id" | "pinned_shop_id" | "visible_stats" | "card_color">
>;

export interface QuizOption {
  id: string;
  label: string;
  emoji?: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
  multi?: boolean;
}

/** Question id → chosen option ids. */
export type QuizAnswers = Record<string, string[]>;

export interface QuizResult {
  user_id: string;
  personality: string;
  stats: BobaStats;
  weights: DimensionScores;
}

/** Enough to draw a name and avatar without fetching the whole profile. */
export interface Author {
  handle: string;
  display_name: string;
  avatar: Avatar;
}

export interface FeedComment {
  id: string;
  user_id: string;
  author: Author;
  text: string;
  created_at: string;
}

export type FeedKind = "review" | "pick" | "rec" | "joined";

export interface FeedItem {
  id: string;
  user_id: string;
  author: Author;
  kind: FeedKind;
  drink_id: string | null;
  rating: number | null;
  text: string | null;
  to_user_id?: string;
  to_author?: Author;
  created_at: string;
  likes: number;
  liked_by_me: boolean;
  comments: FeedComment[];
  /** Reserved for uploads; always null for now. */
  photo_url?: string | null;
}

export interface RecommendRequest {
  user_id: string;
  query: string;
  preference_overrides: Record<string, number>;
}

/** GET /drinks. photo_url stays null until real photos exist. */
export interface DrinkListing {
  id: string;
  name: string;
  shop_id: string;
  price: number;
  flavor_tags: string[];
  photo_url: string | null;
}

/** GET /shops. Includes shops that have not joined yet. */
export interface ShopListing {
  id: string;
  name: string;
  neighborhood: string;
  photo_url: string | null;
  /** Planned: set by the shop on its Shop tab. */
  description?: string;
}

/* Accounts. Contract in docs/PLAN.md, "Accounts, store tools, and ordering"; served by Track A, mocked in api/auth.ts. */

export type AccountRole = "customer" | "store";

export interface Account {
  email: string;
  user_id: string;
  role: AccountRole;
  shop_id?: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  role: AccountRole;
  shop_id?: string;
  /** Customers: the profile created by POST /users just before sign-up. */
  user_id?: string;
}

/* Store tools. Contract in docs/PLAN.md, "Accounts, store tools, and ordering"; mocked in mocks/shopStore.ts. */

export interface MenuSection {
  id: string;
  name: string;
  order: number;
  drink_ids: string[];
}

export interface DrinkOptions {
  sugar: string[];
  ice: string[];
  toppings: { name: string; price: number }[];
}

export interface DrinkInput {
  name: string;
  price: number;
  description?: string;
  photo_url?: string | null;
  flavor_tags: string[];
  attributes: TasteProfile;
  options?: DrinkOptions;
}

export interface ShopDrink extends DrinkInput {
  id: string;
  shop_id: string;
  available: boolean;
}

export type OfferRule =
  | { id: string; enabled: boolean; kind: "max_discount"; value: { percent: number; dollars: number } }
  | { id: string; enabled: boolean; kind: "drinks"; value: { drink_ids: string[] } }
  | { id: string; enabled: boolean; kind: "sections"; value: { section_ids: string[] } }
  | { id: string; enabled: boolean; kind: "hours"; value: { start: number; end: number } }
  | { id: string; enabled: boolean; kind: "days"; value: { days: number[] } }
  | { id: string; enabled: boolean; kind: "daily_limit"; value: { count: number } };

export type OfferRuleKind = OfferRule["kind"];
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type OfferRuleInput = DistributiveOmit<OfferRule, "id">;

export interface OfferRules {
  platform: { id: string; text: string }[];
  rules: OfferRule[];
  cap: { percent: number; dollars: number };
}

export type DemandRange = "week" | "month" | "year";

export interface Demand {
  range: DemandRange;
  people: number;
  bases: { base: "milk" | "fruit" | "tea"; share: number }[];
  flavors: { tag: string; share: number }[];
  top_drinks: { drink_id: string; count: number }[];
  own_top_drinks: { drink_id: string; count: number }[];
  priorities: DimensionScores;
}

export interface ShopProfilePatch {
  description?: string;
  photo_url?: string | null;
}

/* Custom what-if. Contract in docs/PLAN.md, "Custom what-if at the counter". */

export type WhatIf =
  | { kind: "sold_out" | "restock"; drink_id: string }
  | { kind: "shop_offline" | "shop_online" | "shop_join"; shop_id: string }
  | { kind: "avoid"; tag: string }
  | { kind: "taste"; attribute: TasteAttribute; direction: "more" | "less" }
  | { kind: "max_price"; dollars: number }
  | { kind: "price"; drink_id: string; dollars: number };

export type WhatIfKind = WhatIf["kind"];

export interface WhatIfParse {
  changes: WhatIf[];
  not_understood: string[];
}

/* Orders. Request and receipt are from the contract; the full Order shape is B's proposal (see PROGRESS.md). */

export type OrderStatus = "placed" | "accepted" | "ready" | "picked_up" | "cancelled";
export type PayMethod = "card" | "pickup";

export interface OrderItemInput {
  drink_id: string;
  sugar?: string;
  ice?: string;
  toppings?: string[];
}

export interface OrderRequest {
  shop_id: string;
  items: OrderItemInput[];
  offer_id?: string;
  pay: PayMethod;
}

export interface OrderReceipt {
  order_id: string;
  total: number;
  status: "placed";
  payment_url?: string | null;
}

export interface OrderItem extends OrderItemInput {
  name: string;
  /** The drink plus its toppings, before any offer. */
  price: number;
}

export interface Order {
  order_id: string;
  user_id: string;
  /** What the shop calls out at pickup. */
  customer_name: string;
  shop_id: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  pickup_fee: number;
  total: number;
  pay: PayMethod;
  status: OrderStatus;
  created_at: string;
  rating?: number | null;
}
