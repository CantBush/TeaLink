import { useSyncExternalStore } from "react";
import { client } from "../api/client.ts";
import type {
  Decision,
  DimensionScores,
  Health,
  LensEvent,
  PreferenceReport,
  Proposal,
  SimilarUser,
  TasteProfile,
} from "../api/types.ts";
import { social } from "../api/social.ts";
import { resetCovers } from "../lib/images.ts";
import { sampleSession } from "../mocks/sample.ts";
import { orderMock } from "../mocks/orderStore.ts";
import { shopMock } from "../mocks/shopStore.ts";
import { resetSocialMock } from "../mocks/socialStore.ts";
import { shopProfilesChanged } from "../lib/shopProfile.ts";
import { getMe } from "./me.ts";
import { profilesChanged } from "./social.ts";

function guessName(userId: string): string {
  return userId.charAt(0).toUpperCase() + userId.slice(1);
}

export interface SessionState {
  /** Who the agents are recommending for, and how to address them. */
  userId: string;
  name: string;
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
  /** Which transport answered, from /health after each round. */
  health: Health | null;
  /** Agents whose replies arrived over the AGNTCY bus during the latest round. */
  busAgents: string[];
  usingMock: boolean;
  started: boolean;
  running: boolean;
  round: number;
}

let state: SessionState = {
  userId: getMe(),
  name: guessName(getMe()),
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
  health: null,
  busAgents: [],
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
    .recommend({ user_id: state.userId, query: "What should I get next?", preference_overrides: {} }, pushEvent)
    .catch(() => {
      if (state.decision === null) replayMock();
    })
    .finally(() => {
      set({ running: false });
      refreshHealth();
    });
}

function refreshHealth() {
  const previous = state.health?.remote_replies ?? {};
  void client
    .getHealth()
    .then((health) => {
      const busAgents = Object.entries(health.remote_replies)
        .filter(([agent, count]) => count > (previous[agent] ?? 0))
        .map(([agent]) => agent);
      set({ health, busAgents });
    })
    .catch(() => set({ health: null, busAgents: [] }));
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
    const learned = await client.choose(state.userId, drinkId);
    set({ learned, weights: learned.weights });
    rerun(`You picked ${drinkName}. ${learned.summary}`);
  } catch {
    pushStatus(`You picked ${drinkName}, but the Preference agent did not answer.`);
  }
}

/** The signed-in account changed (sign-up, quiz, or reset): forget the old user's rounds. */
export function switchUser() {
  const userId = getMe();
  seen.clear();
  set({
    userId,
    name: guessName(userId),
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
    round: state.round + 1,
  });
  loadProfile(userId);
}

export async function resetAll() {
  await client.resetDemo().catch(() => {});
  resetSocialMock();
  shopMock.reset();
  orderMock.reset();
  shopProfilesChanged();
  resetCovers();
  profilesChanged();
  set({ learned: null, previousDecision: null, decision: null, change: null });
  rerun("Demo reset to the seeded state.");
}

export function loadProfile(userId: string) {
  void social
    .getUser(userId, userId)
    .then((profile) => {
      if (state.userId === userId) set({ name: profile.display_name });
    })
    .catch(() => {});
  void client
    .getProfile(userId)
    .then((profile) => {
      if (state.userId === userId) setProfile(profile);
    })
    .catch(() => {
      /* Keep the scripted profile when the API is down. */
    });
  void client
    .getSimilar(userId)
    .then((similar) => set({ similar }))
    .catch(() => {});
}
