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

export interface RankedDrink {
  drink_id: string;
  drink_name: string;
  score: number;
  shop_id?: string;
  price?: number;
  dimension_scores?: DimensionScores;
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
  | "preference";

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

export interface RecommendRequest {
  user_id: string;
  query: string;
  preference_overrides: Record<string, number>;
}
