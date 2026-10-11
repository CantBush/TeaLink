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
import { startAgent, stopAgent } from "../api/agents.ts";
import { agentInfo } from "../lib/agents.ts";
import { critique } from "../lib/critic.ts";
import { resolveWithout } from "../lib/withoutAgents.ts";
import { resetCovers, resetPortraits } from "../lib/images.ts";
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
  /** Agents taken out with "kill an agent", in the order they were stopped. */
  stopped: string[];
  /** The subset the API can't stop yet, so the browser leaves them out of each round. */
  browserStopped: string[];
  /** When each phase of the latest round first reached the browser, in ms after the round started. */
  phases: { phase: Phase; ms: number }[];
  /** The Critic challenges each #1 before it's final. Off by default. */
  critic: boolean;
}

export type Phase = "selected" | "proposed" | "scored" | "decided";

const PHASE_OF: Partial<Record<LensEvent["type"], Phase>> = {
  selection: "selected",
  proposal: "proposed",
  objection: "scored",
  decision: "decided",
};
let roundStartedAt = 0;

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
  stopped: [],
  browserStopped: [],
  phases: [],
  critic: false,
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
  if (event.agent_id && state.browserStopped.includes(event.agent_id)) return;
  if (event.type === "decision" && state.browserStopped.length > 0) {
    const decision = resolveWithout(
      event.payload as unknown as Decision,
      state.proposals,
      state.events.filter((item) => item.type === "objection"),
      state.browserStopped,
    );
    event = { ...event, message: decision.explanation, payload: decision as unknown as Record<string, unknown> };
  } else if (event.type === "decision" && state.stopped.length > 0 && !event.payload.missing_agents) {
    event = { ...event, payload: { ...event.payload, missing_agents: state.stopped } };
  }
  const patch: Partial<SessionState> = { events: [...state.events, event] };
  const phase = PHASE_OF[event.type];
  if (phase && !state.phases.some((item) => item.phase === phase)) {
    patch.phases = [...state.phases, { phase, ms: Math.round(performance.now() - roundStartedAt) }];
  }
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
  if (event.type === "decision" && state.critic && !state.events.some((item) => item.type === "critique")) {
    const challenge = critique(event.payload as unknown as Decision);
    if (challenge) {
      localSeq += 1;
      pushEvent({ type: "critique", agent_id: "critic", message: challenge.message, payload: { ...challenge.payload, reply: challenge.reply }, seq: localSeq });
    }
  }
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
  const round = state.round + 1;
  const forThisRound = (event: LensEvent) => {
    if (state.round === round) pushEvent(event);
  };
  roundStartedAt = performance.now();
  set({
    round,
    phases: [],
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
    .recommend(
      { user_id: state.userId, query: "What should I get next?", preference_overrides: {}, critic: state.critic },
      forThisRound,
    )
    .catch(() => {
      if (state.round === round && state.decision === null) replayMock();
    })
    .finally(() => {
      if (state.round !== round) return;
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
export async function pick(drinkId: string, drinkName: string, verb = "picked") {
  try {
    const learned = await client.choose(state.userId, drinkId);
    set({ learned, weights: learned.weights });
    rerun(`You ${verb} ${drinkName}. ${learned.summary}`);
  } catch {
    pushStatus(`You ${verb} ${drinkName}, but the Preference agent did not answer.`);
  }
}

/**
 * You ordered a drink from your top 3, which is the pick. A server that learns on placement sends
 * `learned` (or `null` when it didn't count); an older one sends neither, so the pick goes to /choices.
 */
export async function orderedFromTop3(drinkId: string, drinkName: string, learned: PreferenceReport | null | undefined) {
  if (learned === undefined) {
    await pick(drinkId, drinkName, "ordered");
    return;
  }
  if (learned) set({ learned, weights: learned.weights });
  rerun(`You ordered ${drinkName}.${learned ? ` ${learned.summary}` : ""}`);
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

/**
 * "Kill an agent": take it out of the team, or bring it back, and re-plan. Stopping during a round
 * abandons that round and starts the next one without the agent.
 */
export async function toggleAgent(agentId: string) {
  const name = agentInfo(agentId).name;
  const midRound = state.running;
  if (state.stopped.includes(agentId)) {
    await startAgent(agentId);
    set({
      stopped: state.stopped.filter((id) => id !== agentId),
      browserStopped: state.browserStopped.filter((id) => id !== agentId),
    });
    rerun(`${name} is back at the counter.`);
    return;
  }
  const mode = await stopAgent(agentId);
  set({
    stopped: [...state.stopped, agentId],
    browserStopped: mode === "browser" ? [...state.browserStopped, agentId] : state.browserStopped,
  });
  rerun(`${name} dropped out${midRound ? " mid-round" : ""}. The team re-plans without it.`);
}

export function toggleCritic() {
  set({ critic: !state.critic });
  rerun(state.critic ? "The Critic joins the table and will challenge the #1." : "The Critic leaves the table.");
}

export async function resetAll() {
  const serverStopped = state.stopped.filter((id) => !state.browserStopped.includes(id));
  await Promise.all(serverStopped.map((id) => startAgent(id).catch(() => {})));
  set({ stopped: [], browserStopped: [], critic: false });
  await client.resetDemo().catch(() => {});
  resetSocialMock();
  shopMock.reset();
  orderMock.reset();
  shopProfilesChanged();
  resetCovers();
  resetPortraits();
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
