import type { Decision, EvalResult, LensEvent, Proposal, TasteProfile } from "../api/types.ts";
import evalRaw from "./eval.json";
import raw from "./sample_session.json";

/** A recorded before/after pair, shown on Counterfactual until a live round has run. */
export interface CounterfactualScript {
  change: string;
  before: Decision;
  after: Decision;
}

export interface SampleSession {
  user_id: string;
  profile: TasteProfile;
  events: LensEvent[];
  counterfactual: CounterfactualScript;
}

export const sampleSession = raw as unknown as SampleSession;

export const sampleEval = evalRaw as unknown as EvalResult;

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
