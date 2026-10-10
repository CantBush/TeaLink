import type { Decision, LensEvent, Proposal, TasteProfile } from "../api/types.ts";
import raw from "./sample_session.json";

export interface ScriptedDrink {
  drink_id: string;
  drink_name: string;
  score: number;
}

export interface CounterfactualScript {
  preference_label: string;
  from: number;
  to: number;
  before: ScriptedDrink;
  after: Decision;
  why: string;
}

export interface SampleSession {
  user_id: string;
  profile: TasteProfile;
  events: LensEvent[];
  counterfactual: CounterfactualScript;
}

export const sampleSession = raw as unknown as SampleSession;

export function sampleDecision(): Decision {
  const event = sampleSession.events.find((item) => item.type === "decision");
  return event?.payload as unknown as Decision;
}

export function sampleProposal(drinkId: string): Proposal | null {
  for (const event of sampleSession.events) {
    if (event.type !== "proposal") continue;
    const proposal = event.payload as unknown as Proposal;
    if (proposal.drink_id === drinkId) return proposal;
  }
  return null;
}
