import { useSyncExternalStore } from "react";
import { client } from "../api/client.ts";
import type {
  Decision,
  DimensionScores,
  LensEvent,
  PreferenceReport,
  Proposal,
  SimilarUser,
  TasteProfile,
} from "../api/types.ts";
import { sampleSession } from "../mocks/sample.ts";

export const USER_ID = "andrew";

export interface SessionState {
  profile: TasteProfile;
  events: LensEvent[];
  proposals: Proposal[];
  decision: Decision | null;
  /** Decision from the previous round, for before/after comparisons. */
  previousDecision: Decision | null;
  /** What changed in the world to start the current round, e.g. "Thai Tea just sold out." */
  change: string | null;
  weights: DimensionScores | null;
  preferenceSummary: string | null;
  /** What the last pick taught the Preference agent. */
  learned: PreferenceReport | null;
  similar: SimilarUser[];
  usingMock: boolean;
  started: boolean;
  running: boolean;
  round: number;
}

let state: SessionState = {
  profile: sampleSession.profile,
  events: [],
  proposals: [],
  decision: null,
  previousDecision: null,
  change: null,
  weights: null,
  preferenceSummary: null,
  learned: null,
  similar: [],
  usingMock: false,
  started: false,
  running: false,
  round: 0,
};

const listeners = new Set<() => void>();
let localSeq = 100000;

function set(patch: Partial<SessionState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function getSession(): SessionState {
  return state;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, getSession, getSession);
}

function eventKey(event: LensEvent): string {
  return `${state.round}:${event.seq}`;
}

const seen = new Set<string>();

export function pushEvent(event: LensEvent) {
  const key = eventKey(event);
  if (seen.has(key)) return;
  seen.add(key);
  const patch: Partial<SessionState> = { events: [...state.events, event] };
  if (event.type === "proposal") {
    patch.proposals = [...state.proposals, event.payload as unknown as Proposal];
  }
  if (event.type === "decision") {
    const decision = event.payload as unknown as Decision;
    patch.decision = decision;
    if (decision.weights) patch.weights = decision.weights;
  }
  if (event.type === "preference") {
    const report = event.payload as unknown as Partial<PreferenceReport>;
    if (report.weights) patch.weights = report.weights;
    patch.preferenceSummary = event.message;
  }
  set(patch);
}

export function pushStatus(message: string) {
  localSeq += 1;
  pushEvent({ type: "status", agent_id: null, message, payload: {}, seq: localSeq });
}

export function setProfile(profile: TasteProfile) {
  set({ profile });
}

function replayMock() {
  set({ usingMock: true });
  sampleSession.events.forEach((event, index) => {
    window.setTimeout(() => pushEvent(event), index * 400);
  });
}

function run(note?: string) {
  set({
    round: state.round + 1,
    events: [],
    proposals: [],
    previousDecision: state.decision ?? state.previousDecision,
    change: note ?? null,
    decision: null,
    running: true,
  });
  if (note) pushStatus(note);

  if (import.meta.env.VITE_USE_MOCK === "1") {
    replayMock();
    set({ running: false });
    return;
  }

  void client
    .recommend({ user_id: USER_ID, query: "What should I get next?", preference_overrides: {} }, pushEvent)
    .catch(() => {
      if (state.decision === null) replayMock();
    })
    .finally(() => set({ running: false }));
}

export function startRecommendation() {
  if (state.started) return;
  set({ started: true });
  run();
}

/** Re-run the whole deliberation, e.g. after an event changed the world. */
export function rerun(note?: string) {
  set({ started: true });
  run(note);
}

/** The user picked one of the top 3: teach the Preference agent, then re-rank. */
export async function pick(drinkId: string, drinkName: string) {
  try {
    const learned = await client.choose(USER_ID, drinkId);
    set({ learned, weights: learned.weights });
    rerun(`Andrew picked ${drinkName}. ${learned.summary}`);
  } catch {
    pushStatus(`Andrew picked ${drinkName}, but the Preference agent did not answer.`);
  }
}

export async function resetAll() {
  await client.resetDemo().catch(() => {});
  set({ learned: null, previousDecision: null, decision: null, change: null });
  rerun("Demo reset to the seeded state.");
}

export function loadProfile(userId: string) {
  void client
    .getProfile(userId)
    .then((profile) => setProfile(profile))
    .catch(() => {
      /* Keep the scripted profile when the API is down. */
    });
  void client
    .getSimilar(userId)
    .then((similar) => set({ similar }))
    .catch(() => {});
}
