import { useSyncExternalStore } from "react";
import { client } from "../api/client.ts";
import type { Decision, LensEvent, Proposal, TasteProfile } from "../api/types.ts";
import { sampleSession } from "../mocks/sample.ts";

export interface SessionState {
  profile: TasteProfile;
  events: LensEvent[];
  proposals: Proposal[];
  decision: Decision | null;
  usingMock: boolean;
  started: boolean;
}

let state: SessionState = {
  profile: sampleSession.profile,
  events: [],
  proposals: [],
  decision: null,
  usingMock: false,
  started: false,
};

const listeners = new Set<() => void>();
let localSeq = 1000;

function emit() {
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

export function pushEvent(event: LensEvent) {
  if (state.events.some((item) => item.seq === event.seq)) return;
  const proposals = state.proposals.slice();
  let decision = state.decision;
  if (event.type === "proposal") {
    proposals.push(event.payload as unknown as Proposal);
  }
  if (event.type === "decision") {
    decision = event.payload as unknown as Decision;
  }
  state = {
    ...state,
    events: [...state.events, event],
    proposals,
    decision,
  };
  emit();
}

export function pushStatus(message: string) {
  localSeq += 1;
  pushEvent({
    type: "status",
    agent_id: null,
    message,
    payload: {},
    seq: localSeq,
  });
}

export function setProfile(profile: TasteProfile) {
  state = { ...state, profile };
  emit();
}

function replayMock() {
  state = { ...state, usingMock: true };
  emit();
  sampleSession.events.forEach((event, index) => {
    window.setTimeout(() => pushEvent(event), index * 400);
  });
}

export function startRecommendation() {
  if (state.started) return;
  state = { ...state, started: true };
  emit();

  if (import.meta.env.VITE_USE_MOCK === "1") {
    replayMock();
    return;
  }

  void client
    .recommend(
      {
        user_id: "andrew",
        query: "What should I get next?",
        preference_overrides: {},
      },
      pushEvent,
    )
    .catch(() => {
      if (state.events.length === 0) replayMock();
    });
}

export function loadProfile(userId: string) {
  void client
    .getProfile(userId)
    .then((profile) => setProfile(profile))
    .catch(() => {
      /* Keep the scripted profile when the API is down. */
    });
}
