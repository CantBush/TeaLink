import { type ReactNode, useState } from "react";
import type { Health, LensEvent } from "../api/types.ts";
import { agentLabel, price, readableShops } from "../lib/format.ts";

/** Notes the frontend adds itself (e.g. "Thai Tea just sold out.") use seq numbers from here up. */
const LOCAL_SEQ_START = 100000;

/** Remembered so the timeline stays open across What-if reruns once the presenter opens it. */
const OPEN_KEY = "tealink.timeline.open";

interface Phases {
  changes: LensEvent[];
  selections: LensEvent[];
  preference: LensEvent | null;
  proposals: Map<string, LensEvent[]>;
  candidates: LensEvent | null;
  debate: LensEvent[];
  dropped: LensEvent[];
  offers: LensEvent[];
  notes: LensEvent[];
  decision: LensEvent | null;
}

function split(events: LensEvent[]): Phases {
  const phases: Phases = {
    changes: [],
    selections: [],
    preference: null,
    proposals: new Map(),
    candidates: null,
    debate: [],
    dropped: [],
    offers: [],
    notes: [],
    decision: null,
  };
  for (const event of events) {
    switch (event.type) {
      case "selection":
        phases.selections.push(event);
        break;
      case "preference":
        phases.preference = event;
        break;
      case "proposal": {
        const agent = event.agent_id ?? "agent";
        phases.proposals.set(agent, [...(phases.proposals.get(agent) ?? []), event]);
        break;
      }
      case "objection":
        phases.debate.push(event);
        break;
      case "offer":
        phases.offers.push(event);
        break;
      case "decision":
        phases.decision = event;
        break;
      case "status":
        if (event.seq >= LOCAL_SEQ_START) phases.changes.push(event);
        else if (event.message.startsWith("Dropped")) phases.dropped.push(event);
        else if (event.message.includes("candidates")) phases.candidates = event;
        else if (event.message !== "Starting deliberation.") phases.notes.push(event);
        break;
    }
  }
  return phases;
}

function Phase({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <li className="timeline-in">
      <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-amber uppercase">
        {step}. {title}
      </p>
      {children}
    </li>
  );
}

function debateTone(event: LensEvent): { card: string; tag: string } {
  if (event.payload.kind === "veto") return { card: "border-[#b4533c]/60 bg-[#fbeee9]", tag: "Veto" };
  if (event.payload.kind === "concern") return { card: "border-line/80 bg-cream", tag: "Pushback" };
  return { card: "border-line/80 bg-cream", tag: "Review" };
}

function proposalLine(event: LensEvent): string {
  const name = typeof event.payload.drink_name === "string" ? event.payload.drink_name : event.message;
  const cost = typeof event.payload.price === "number" ? price(event.payload.price) : "";
  return cost ? `${name} · ${cost}` : name;
}

function TransportBadge({ health, busCount, usingMock }: { health: Health | null; busCount: number; usingMock: boolean }) {
  const base = "rounded-full px-2.5 py-0.5 text-xs font-semibold";
  if (usingMock) return <span className={`${base} text-mute`}>Saved round</span>;
  if (!health) return <span className={`${base} text-mute`}>Live</span>;
  if (health.effective === "agntcy" && busCount > 0) {
    return (
      <span className={`${base} bg-ink text-cream`} title="Agents answered over A2A on a NATS bus (Cisco AGNTCY)">
        AGNTCY · {busCount} agents over NATS
      </span>
    );
  }
  if (health.transport === "agntcy") {
    return (
      <span className={`${base} bg-[#f0e2d0]`} title="AGNTCY is configured, but the bus didn't answer, so agents ran in-process">
        In-process fallback
      </span>
    );
  }
  return <span className={`${base} text-mute`}>In-process agents</span>;
}

export function AgentTimeline({
  events,
  usingMock,
  started,
  health = null,
  busAgents = [],
  name = "Andrew",
}: {
  name?: string;
  events: LensEvent[];
  usingMock: boolean;
  started: boolean;
  health?: Health | null;
  busAgents?: string[];
}) {
  const overBus = new Set(busAgents);
  const phases = split(events);
  const present = {
    team: phases.selections.length > 0,
    priorities: phases.preference !== null,
    proposals: phases.proposals.size > 0,
    debate: phases.debate.length > 0,
    dropped: phases.dropped.length > 0,
    offers: phases.offers.length > 0,
    decision: phases.decision !== null,
  };
  const shown = (Object.keys(present) as (keyof typeof present)[]).filter((key) => present[key]);
  const stepOf = (key: keyof typeof present) => shown.indexOf(key) + 1;
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) === "1");
  const toggle = () => {
    localStorage.setItem(OPEN_KEY, open ? "0" : "1");
    setOpen(!open);
  };
  const proposalCount = [...phases.proposals.values()].reduce((sum, list) => sum + list.length, 0);
  const summary = [
    phases.selections.length ? `${phases.selections.length} agents` : null,
    proposalCount ? `${proposalCount} proposals` : null,
    phases.debate.length ? `${phases.debate.length} objections` : null,
    phases.dropped.length ? `${phases.dropped.length} ruled out` : null,
    phases.offers.length ? "1 shop offer" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rounded-[28px] border border-line bg-foam/80 p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl">At the counter</h2>
        {started || usingMock ? (
          <TransportBadge health={health} busCount={busAgents.length} usingMock={usingMock} />
        ) : (
          <p className="text-xs text-mute">Waiting</p>
        )}
      </div>

      {phases.changes.map((event) => (
        <p
          key={event.seq}
          className="timeline-in mb-4 rounded-2xl border border-amber bg-[#f8efe2] px-4 py-3 text-sm font-semibold"
        >
          {event.message}
        </p>
      ))}

      {events.length === 0 ? (
        <p className="text-sm text-mute">{started ? "Asking the counter…" : "The round has not started."}</p>
      ) : !open ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={false}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-line bg-cream px-4 py-3 text-left"
        >
          <span>
            <span className="block font-semibold">See how the agents decided</span>
            {summary ? <span className="block text-sm text-mute">{summary}</span> : null}
          </span>
          <span aria-hidden className="text-xl text-amber">
            ›
          </span>
        </button>
      ) : (
        <ol className="space-y-5">
          {phases.selections.length > 0 ? (
            <Phase step={stepOf("team")} title="Team selected">
              <details className="rounded-2xl border border-line/80 bg-cream px-4 py-3">
                <summary className="cursor-pointer list-none">
                  <span className="flex flex-wrap gap-1.5">
                    {phases.selections.map((event) => (
                      <span
                        key={event.seq}
                        className="flex items-center gap-1 rounded-full bg-[#f0e2d0] px-2.5 py-0.5 text-xs font-semibold"
                      >
                        {overBus.has(event.agent_id ?? "") ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-label="over NATS" />
                        ) : null}
                        {agentLabel(event.agent_id ?? "")}
                      </span>
                    ))}
                  </span>
                  <span className="mt-2 block text-xs text-mute">
                    Picked by capability.
                    {overBus.size > 0 ? " A dot means the agent answered over the AGNTCY bus." : ""} Tap to see
                    why each agent was chosen.
                  </span>
                </summary>
                <ul className="mt-3 space-y-1.5 text-sm text-mute">
                  {phases.selections.map((event) => (
                    <li key={event.seq}>{event.message}</li>
                  ))}
                </ul>
              </details>
            </Phase>
          ) : null}

          {phases.preference ? (
            <Phase step={stepOf("priorities")} title={`${name}'s priorities`}>
              <p className="rounded-2xl border border-amber/60 bg-[#fbf4ea] px-4 py-3 text-sm">
                {phases.preference.message}
              </p>
            </Phase>
          ) : null}

          {phases.proposals.size > 0 ? (
            <Phase step={stepOf("proposals")} title="Each agent proposes">
              <ul className="space-y-2">
                {[...phases.proposals.entries()].map(([agent, proposals]) => (
                  <li key={agent} className="rounded-2xl border border-line/80 bg-cream px-4 py-3">
                    <p className="font-semibold">{agentLabel(agent)}</p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {proposals.map((event) => (
                        <li key={event.seq}>
                          <span className="font-semibold">{proposalLine(event)}</span>
                          {typeof event.payload.rationale === "string" ? (
                            <span className="block text-mute">{event.payload.rationale}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Phase>
          ) : null}

          {phases.debate.length > 0 ? (
            <Phase step={stepOf("debate")} title="They argue">
              {phases.candidates ? <p className="mb-2 text-sm text-mute">{phases.candidates.message}</p> : null}
              <ul className="space-y-2">
                {phases.debate.map((event) => {
                  const { card, tag } = debateTone(event);
                  return (
                    <li key={event.seq} className={`rounded-2xl border px-4 py-3 text-sm ${card}`}>
                      <span className="mr-2 text-[11px] font-semibold tracking-[0.12em] text-amber uppercase">
                        {tag}
                      </span>
                      {event.message}
                    </li>
                  );
                })}
              </ul>
            </Phase>
          ) : null}

          {phases.dropped.length > 0 ? (
            <Phase step={stepOf("dropped")} title="Ruled out">
              <ul className="space-y-1.5 rounded-2xl border border-[#b4533c]/40 bg-cream px-4 py-3 text-sm">
                {phases.dropped.map((event) => (
                  <li key={event.seq}>{readableShops(event.message.replace(/^Dropped /, ""))}</li>
                ))}
              </ul>
            </Phase>
          ) : null}

          {phases.offers.length > 0 ? (
            <Phase step={stepOf("offers")} title="A shop makes an offer">
              <ul className="space-y-2">
                {phases.offers.map((event) => (
                  <li key={event.seq} className="rounded-2xl border border-[#3f7d58]/50 bg-[#eef6ef] px-4 py-3 text-sm">
                    <span className="mr-2 text-[11px] font-semibold tracking-[0.12em] text-[#3f7d58] uppercase">
                      {typeof event.payload.percent === "number" ? `${event.payload.percent}% off` : "Offer"}
                    </span>
                    {readableShops(event.message)}
                  </li>
                ))}
              </ul>
            </Phase>
          ) : null}

          {phases.notes.map((event) => (
            <li key={event.seq} className="timeline-in text-sm text-mute">
              {event.message}
            </li>
          ))}

          {phases.decision ? (
            <Phase step={stepOf("decision")} title="Decision">
              <p className="rounded-2xl border border-amber bg-[#f8efe2] px-4 py-3 font-semibold">
                {phases.decision.message}
              </p>
            </Phase>
          ) : null}
        </ol>
      )}
      {open && events.length > 0 ? (
        <button type="button" onClick={toggle} aria-expanded className="mt-4 min-h-11 text-sm font-semibold text-mute hover:text-ink">
          Hide the details
        </button>
      ) : null}
    </section>
  );
}
