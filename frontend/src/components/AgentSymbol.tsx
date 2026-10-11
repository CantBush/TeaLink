import type { ReactNode } from "react";
import { type AgentKind, agentKind } from "../lib/agents.ts";

/** One minimal line symbol per agent; every shop agent shares the storefront. */
const PATHS: Record<AgentKind, ReactNode> = {
  taste: (
    <>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
    </>
  ),
  social: (
    <>
      <circle cx="9" cy="8.5" r="2.8" />
      <circle cx="16.5" cy="9.5" r="2.2" />
      <path d="M3.8 19c.5-3.4 2.6-5.3 5.2-5.3s4.7 1.9 5.2 5.3" />
      <path d="M14.6 14.2c2.6-.5 4.9 1 5.6 4.3" />
    </>
  ),
  explorer: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="m15.5 8.5-2 5-5 2 2-5Z" />
    </>
  ),
  budget: (
    <>
      <path d="M4 12.6V5.5A1.5 1.5 0 0 1 5.5 4h7.1l7.4 7.4-8.6 8.6Z" />
      <circle cx="8.6" cy="8.6" r="1.3" />
    </>
  ),
  preference: (
    <>
      <path d="M12 4.5v15M7.5 19.5h9" />
      <path d="M5 8h14" />
      <path d="M5 8 2.8 13a2.3 2.3 0 0 0 4.4 0Z" />
      <path d="M19 8l-2.2 5a2.3 2.3 0 0 0 4.4 0Z" />
    </>
  ),
  shop: (
    <>
      <path d="M4 10v9.5h16V10" />
      <path d="M3 10 5 4.5h14L21 10c0 1.4-1.1 2.3-2.3 2.3S16.4 11.4 16.4 10c0 1.4-1 2.3-2.2 2.3S12 11.4 12 10c0 1.4-1 2.3-2.2 2.3S7.6 11.4 7.6 10c0 1.4-1 2.3-2.3 2.3S3 11.4 3 10Z" />
      <path d="M10 19.5v-4.5h4v4.5" />
    </>
  ),
};

export function AgentSymbol({ agentId, className = "h-5 w-5" }: { agentId: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[agentKind(agentId)]}
    </svg>
  );
}
