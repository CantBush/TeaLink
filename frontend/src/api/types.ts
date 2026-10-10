export type TasteAttribute =
  | "sweetness"
  | "milkiness"
  | "tea_intensity"
  | "fruitiness"
  | "toppings";

/** The five taste attributes, each a 0–1 number. */
export type TasteProfile = Record<TasteAttribute, number>;

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
}

export type ObjectionKind = "veto" | "concern" | "support";

export interface Objection {
  agent_id: string;
  target_drink_id: string;
  kind: ObjectionKind;
  reason: string;
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
}

export type LensEventType =
  | "selection"
  | "proposal"
  | "objection"
  | "decision"
  | "status";

export interface LensEvent {
  type: LensEventType;
  agent_id: string | null;
  message: string;
  payload: Record<string, unknown>;
  seq: number;
}

export interface RecommendRequest {
  user_id: string;
  query: string;
  preference_overrides: Record<string, number>;
}
