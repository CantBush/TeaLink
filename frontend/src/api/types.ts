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
  Pick<UserProfile, "display_name" | "bio" | "avatar" | "accent" | "pinned_drink_id" | "pinned_shop_id" | "visible_stats">
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
}
