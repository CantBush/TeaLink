import { agentLabel } from "./format.ts";

export type AgentKind = "taste" | "social" | "explorer" | "budget" | "preference" | "shop";

export interface AgentInfo {
  kind: AgentKind;
  name: string;
  description: string;
}

const CORE: Record<Exclude<AgentKind, "shop">, Omit<AgentInfo, "kind">> = {
  taste: {
    name: "Taste",
    description: "Learns your taste from your own reviews and scores every drink by how well it fits you.",
  },
  social: {
    name: "Social",
    description: "Knows what the people with taste most like yours loved, and speaks up for those drinks.",
  },
  explorer: {
    name: "Explorer",
    description: "Argues for drinks you haven't tried yet, so you don't order the same thing forever.",
  },
  budget: {
    name: "Budget",
    description: "Argues for cheaper drinks that still fit you.",
  },
  preference: {
    name: "Preference",
    description: "Learns how much you care about taste, friends, trying something new, and price from every pick you make.",
  },
};

export function agentKind(agentId: string): AgentKind {
  if (/^shop[_:]/.test(agentId)) return "shop";
  return agentId in CORE ? (agentId as AgentKind) : "shop";
}

/** Name and description for an agent, preferring what the backend sent when it sends one. */
export function agentInfo(agentId: string, fromBackend?: { name?: unknown; description?: unknown }): AgentInfo {
  const kind = agentKind(agentId);
  const base =
    kind === "shop"
      ? {
          name: agentLabel(agentId),
          description: `Speaks for ${agentLabel(agentId)}: confirms what's in stock, and may offer a small discount in a close call.`,
        }
      : CORE[kind];
  return {
    kind,
    name: typeof fromBackend?.name === "string" ? fromBackend.name.replace(/ agent$/, "") : base.name,
    description: typeof fromBackend?.description === "string" ? fromBackend.description : base.description,
  };
}
