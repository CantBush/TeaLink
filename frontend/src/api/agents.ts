import { agentKind } from "../lib/agents.ts";
import type { TraceSpan } from "./types.ts";
import { client } from "./client.ts";
import { Unavailable, request } from "./http.ts";

/** Who carries out a stop or restart: the API, or the browser re-scoring the round without the teagent. */
export type StopMode = "server" | "browser";

const shopId = (agentId: string) => agentId.replace(/^shop[_:]/, "");

/**
 * Take a teagent out of the team with `POST /agents/{id}/stop`. An older API without the route
 * takes a shop offline through the shop event route instead, and the browser leaves a core teagent
 * out of the next round.
 */
export async function stopAgent(agentId: string): Promise<StopMode> {
  try {
    await request("POST", `/agents/${encodeURIComponent(agentId)}/stop`);
    return "server";
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
  }
  if (agentKind(agentId) === "shop") {
    await client.shopOffline(shopId(agentId));
    return "server";
  }
  return "browser";
}

/** A round's trace, or null when the API has none for it (an older API, or a saved round). */
export async function getTrace(sessionId: string): Promise<TraceSpan[] | null> {
  try {
    return await request<TraceSpan[]>("GET", `/trace/${encodeURIComponent(sessionId)}`);
  } catch {
    return null;
  }
}

/** Switch the server's Critic on or off. An older API without the route leaves it to the browser. */
export async function setCritic(on: boolean): Promise<StopMode> {
  try {
    await request("POST", on ? "/critic/enable" : "/critic/disable");
    return "server";
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
    return "browser";
  }
}

export async function startAgent(agentId: string): Promise<StopMode> {
  try {
    await request("POST", `/agents/${encodeURIComponent(agentId)}/start`);
    return "server";
  } catch (error) {
    if (!(error instanceof Unavailable)) throw error;
  }
  if (agentKind(agentId) === "shop") {
    await client.shopJoin(shopId(agentId));
    return "server";
  }
  return "browser";
}
