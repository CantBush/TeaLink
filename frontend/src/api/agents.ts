import { agentKind } from "../lib/agents.ts";
import { client } from "./client.ts";
import { Unavailable, request } from "./http.ts";

/** Who carries out a stop or restart: the API, or the browser re-scoring the round without the agent. */
export type StopMode = "server" | "browser";

const shopId = (agentId: string) => agentId.replace(/^shop[_:]/, "");

/**
 * Take an agent out of the team (docs/PLAN.md "More of the Cisco challenge"). Until
 * `POST /agents/{id}/stop` is served, a shop goes offline through the existing event route and a
 * core agent is left out of the next round in the browser.
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
