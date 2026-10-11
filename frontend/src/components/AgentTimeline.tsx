import { useState } from "react";
import { Link } from "react-router-dom";
import type { Health, LensEvent } from "../api/types.ts";
import { agentInfo, agentKind } from "../lib/agents.ts";
import { drinkInfo } from "../lib/catalog.ts";
import { dimensionLabel, price, readableShops } from "../lib/format.ts";
import { DIMENSION_OF } from "../lib/withoutAgents.ts";
import { AgentSymbol } from "./AgentSymbol.tsx";
import { LeafPair, TeaBowl } from "./Doodles.tsx";

/** Notes the frontend adds itself (e.g. "Thai Tea just sold out.") use seq numbers from here up. */
const LOCAL_SEQ_START = 100000;

type Tone = "plain" | "back" | "doubt" | "veto" | "soften" | "offer" | "priorities";

type ChatItem =
  | { kind: "divider"; key: string; text: string }
  | { kind: "system"; key: string; text: string; tone: "change" | "dropped" | "note" }
  | { kind: "message"; key: string; agentId: string; tag: string | null; tone: Tone; text: string; lines?: string[] };

function TransportBadge({ health, busCount, usingMock }: { health: Health | null; busCount: number; usingMock: boolean }) {
  const base = "rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-[0.04em] normal-case";
  if (usingMock) return <span className={`${base} bg-sage text-mute`}>Saved round</span>;
  if (!health) return <span className={`${base} bg-sage text-mute`}>Live</span>;
  if (health.effective === "agntcy" && busCount > 0) {
    return (
      <span className={`${base} bg-ink text-cream`} title="Agents answered over A2A on a NATS bus (Cisco AGNTCY)">
        AGNTCY · {busCount} agents over NATS
      </span>
    );
  }
  if (health.transport === "agntcy") {
    return (
      <span className={`${base} bg-sage`} title="AGNTCY is configured, but the bus didn't answer, so agents ran in-process">
        In-process fallback
      </span>
    );
  }
  return <span className={`${base} bg-sage text-mute`}>In-process agents</span>;
}

/** Drop the speaker's own name from backend text, since the chat already shows who is talking. */
function firstPerson(agentId: string, text: string): string {
  const name = agentInfo(agentId).name;
  const trimmed = text.replace(/^Veto:\s*/, "");
  const verb = trimmed.match(/^[^:;]*? (?=(confirms|backs|pushes back|has no) )/);
  if (verb) return readableShops(trimmed.slice(verb[0].length));
  if (trimmed.startsWith(`${name} `)) return readableShops(trimmed.slice(name.length + 1));
  return readableShops(trimmed);
}

/** Drinks this agent softened on this round; a summary event lists them on `objections[].revised_from`. */
function softened(event: LensEvent): string[] {
  const items = Array.isArray(event.payload.objections) ? (event.payload.objections as Record<string, unknown>[]) : [];
  return items
    .filter((item) => item.revised_from)
    .map((item) => {
      const id = typeof item.target_drink_id === "string" ? item.target_drink_id : "";
      return drinkInfo(id)?.name ?? id;
    })
    .filter(Boolean);
}

function objectionTone(event: LensEvent): { tone: Tone; tag: string | null } {
  const payload = event.payload;
  if (payload.revised_from || softened(event).length > 0) return { tone: "soften", tag: "softens" };
  if (payload.kind === "veto" || event.message.startsWith("Veto:")) return { tone: "veto", tag: "veto" };
  if (agentKind(event.agent_id ?? "") === "shop") return { tone: "back", tag: null };
  if (payload.kind === "concern") return { tone: "doubt", tag: null };
  return { tone: "back", tag: null };
}

function buildChat(events: LensEvent[]): { items: ChatItem[]; selections: LensEvent[]; decision: LensEvent | null } {
  const items: ChatItem[] = [];
  const selections: LensEvent[] = [];
  let decision: LensEvent | null = null;
  let round = 0;
  let opened = false;
  const picks = new Map<string, Extract<ChatItem, { kind: "message" }>>();

  for (const event of events) {
    const key = `${event.type}-${event.seq}`;
    const agentId = event.agent_id ?? "";
    switch (event.type) {
      case "selection":
        selections.push(event);
        break;
      case "preference":
        items.push({ kind: "message", key, agentId: "preference", tag: "your priorities", tone: "priorities", text: event.message });
        break;
      case "proposal": {
        if (!opened) {
          items.push({ kind: "divider", key: `${key}-open`, text: "opening picks" });
          opened = true;
        }
        const name = typeof event.payload.drink_name === "string" ? event.payload.drink_name : event.message;
        const cost = typeof event.payload.price === "number" ? price(event.payload.price) : "";
        const line = cost ? `${name} · ${cost}` : name;
        const existing = picks.get(agentId);
        if (existing) {
          existing.lines = [...(existing.lines ?? []), line];
        } else {
          const message: Extract<ChatItem, { kind: "message" }> = {
            kind: "message",
            key,
            agentId,
            tag: "proposes",
            tone: "plain",
            text: typeof event.payload.rationale === "string" ? `${name}: ${event.payload.rationale}` : "",
            lines: [line],
          };
          picks.set(agentId, message);
          items.push(message);
        }
        break;
      }
      case "objection": {
        const eventRound = typeof event.payload.round === "number" ? event.payload.round : 1;
        if (eventRound !== round) {
          round = eventRound;
          items.push({
            kind: "divider",
            key: `${key}-round`,
            text: round <= 1 ? "round 1 · everyone weighs in on the shortlist" : `rebuttal ${round - 1} · they answer each other`,
          });
        }
        const { tone, tag } = objectionTone(event);
        const gaveWay = softened(event);
        items.push({
          kind: "message",
          key,
          agentId,
          tag,
          tone,
          text: firstPerson(agentId, event.message) + (gaveWay.length ? ` Softens on ${gaveWay.join(", ")}.` : ""),
        });
        break;
      }
      case "offer":
        items.push({
          kind: "message",
          key,
          agentId,
          tag: typeof event.payload.percent === "number" ? `${event.payload.percent}% off` : "offer",
          tone: "offer",
          text: firstPerson(agentId, event.message),
        });
        break;
      case "agent_lost":
        items.push({ kind: "system", key, text: event.message, tone: "dropped" });
        break;
      case "critique": {
        const reply =
          typeof event.payload.reply === "string"
            ? event.payload.reply
            : event.payload.changed_pick
              ? "The Critic was right, so the arbiter changed the pick."
              : "The arbiter answered it, and the pick holds.";
        items.push({ kind: "divider", key: `${key}-critic`, text: "the critic checks the #1" });
        items.push({ kind: "message", key, agentId: "critic", tag: "challenges", tone: "doubt", text: event.message });
        items.push({ kind: "system", key: `${key}-reply`, text: `arbiter: ${reply}`, tone: "note" });
        break;
      }
      case "decision":
        decision = event;
        break;
      case "status":
        if (event.seq >= LOCAL_SEQ_START) items.push({ kind: "system", key, text: event.message, tone: "change" });
        else if (event.message.startsWith("Dropped"))
          items.push({ kind: "system", key, text: `ruled out: ${readableShops(event.message.replace(/^Dropped /, ""))}`, tone: "dropped" });
        else if (event.message.includes("candidates")) {
          const count = Array.isArray(event.payload.candidate_drink_ids) ? event.payload.candidate_drink_ids.length : null;
          if (count) items.push({ kind: "divider", key, text: `${count} drinks on the shortlist` });
        } else if (event.message !== "Starting deliberation.") items.push({ kind: "system", key, text: event.message, tone: "note" });
        break;
    }
  }
  return { items, selections, decision };
}

const BUBBLE: Record<Tone, string> = {
  plain: "bg-cream",
  back: "bg-cream",
  doubt: "bg-[#f6efe6]",
  veto: "bg-[#fbeee9] ring-1 ring-[#b4533c]/30",
  soften: "bg-mist ring-1 ring-moss/30",
  offer: "bg-[#eef6ef] ring-1 ring-[#3f7d58]/30",
  priorities: "bg-mist",
};

const TAG: Record<Tone, string> = {
  plain: "text-mute",
  back: "text-moss",
  doubt: "text-[#9a6a2f]",
  veto: "text-[#b4533c]",
  soften: "text-moss",
  offer: "text-[#3f7d58]",
  priorities: "text-moss",
};

/** Agents "kill an agent" can take out. Preference stays, since every score is weighted by it. */
function stoppable(agentId: string): boolean {
  return agentKind(agentId) !== "preference";
}

function TeamGrid({
  selections,
  overBus,
  stopped,
  onToggle,
}: {
  selections: LensEvent[];
  overBus: Set<string>;
  stopped: string[];
  onToggle?: (agentId: string) => Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const members = [
    ...selections.map((event) => ({ id: event.agent_id ?? "", key: `s${event.seq}`, payload: event.payload })),
    ...stopped
      .filter((id) => !selections.some((event) => event.agent_id === id))
      .map((id) => ({ id, key: `x${id}`, payload: {} as Record<string, unknown> })),
  ];
  const open = members.find((member) => member.id === openId) ?? null;
  const info = open ? agentInfo(open.id, open.payload) : null;
  const openStopped = open ? stopped.includes(open.id) : false;

  const toggle = (agentId: string) => {
    if (!onToggle) return;
    setBusy(true);
    onToggle(agentId)
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  return (
    <div>
      <ul className="grid grid-cols-4 gap-3 sm:grid-cols-6">
        {members.map((member) => {
          const { id } = member;
          const { name } = agentInfo(id, member.payload);
          const on = id === openId;
          const off = stopped.includes(id);
          return (
            <li key={member.key} className="timeline-in">
              <button
                type="button"
                onClick={() => setOpenId(on ? null : id)}
                aria-expanded={on}
                aria-label={off ? `${name}, offline` : name}
                className="flex w-full flex-col items-center gap-1.5 rounded-2xl p-1.5 text-center normal-case"
              >
                <span
                  className={`relative grid h-12 w-12 place-items-center rounded-full transition-colors ${
                    off
                      ? `border border-dashed border-ink/40 text-ink/35 ${on ? "bg-ink/10" : "bg-cream"}`
                      : on
                        ? "bg-ink text-foam"
                        : "bg-sage text-ink hover:bg-ink/10"
                  }`}
                >
                  <AgentSymbol agentId={id} className="h-6 w-6" />
                  {off ? (
                    <span className="absolute inset-0 grid place-items-center" aria-hidden>
                      <span className="h-px w-9 rotate-45 bg-[#b4533c]" />
                    </span>
                  ) : overBus.has(id) ? (
                    <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-foam bg-moss" aria-label="answered over NATS" />
                  ) : null}
                </span>
                <span className={`w-full truncate text-xs tracking-[0.04em] lowercase ${off ? "text-mute line-through" : "text-ink/80"}`}>{name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && info ? (
        <div className="timeline-in mt-3 flex gap-4 rounded-2xl bg-mist p-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${openStopped ? "bg-cream text-ink/40" : "bg-ink text-foam"}`}>
            <AgentSymbol agentId={open.id} className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl leading-tight">
              {info.name}
              {openStopped ? <span className="ml-2 font-sans text-sm text-[#b4533c]">offline</span> : null}
            </p>
            <p className="mt-1 text-[15px]">{info.description}</p>
            {!openStopped && overBus.has(open.id) ? (
              <p className="mt-2 text-xs text-mute">Answered this round over the AGNTCY bus.</p>
            ) : null}
            {onToggle && stoppable(open.id) ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => toggle(open.id)}
                className={`mt-3 min-h-10 rounded-full px-4 text-sm font-semibold disabled:opacity-50 ${
                  openStopped ? "bg-ink text-foam" : "border border-[#b4533c]/50 text-[#8a3b2a] hover:bg-[#fbeee9]"
                }`}
              >
                {busy ? "…" : openStopped ? `Bring ${info.name} back` : `Stop ${info.name}`}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-mute">
          Picked by capability. Tap an agent to see what it does, or to stop it and watch the team re-plan.
          {overBus.size > 0 ? " A green dot means it answered over the AGNTCY bus." : ""}
        </p>
      )}
    </div>
  );
}

function Chat({ items }: { items: ChatItem[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item) => {
        if (item.kind === "divider") {
          return (
            <li key={item.key} className="timeline-in flex items-center gap-3 pt-2 text-xs tracking-[0.12em] text-mute lowercase">
              <span className="h-px flex-1 bg-line" />
              {item.text}
              <span className="h-px flex-1 bg-line" />
            </li>
          );
        }
        if (item.kind === "system") {
          return (
            <li key={item.key} className="timeline-in flex justify-center">
              <span
                className={`rounded-full px-3.5 py-1.5 text-center text-sm ${
                  item.tone === "change"
                    ? "bg-ink text-foam"
                    : item.tone === "dropped"
                      ? "bg-[#fbeee9] text-[#8a3b2a]"
                      : "bg-sage text-mute"
                }`}
              >
                {item.text}
              </span>
            </li>
          );
        }
        const info = agentInfo(item.agentId);
        return (
          <li key={item.key} className="timeline-in flex items-start gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sage text-ink">
              <AgentSymbol agentId={item.agentId} className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 max-w-[36rem]">
              <p className="mb-0.5 flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="font-semibold text-ink lowercase">{info.name}</span>
                {item.tag ? <span className={`tracking-[0.08em] lowercase ${TAG[item.tone]}`}>{item.tag}</span> : null}
              </p>
              <div className={`rounded-2xl rounded-tl-md px-4 py-2.5 text-[15px] leading-snug ${BUBBLE[item.tone]}`}>
                {item.lines ? (
                  <ul className="space-y-0.5">
                    {item.lines.map((line) => (
                      <li key={line} className="font-semibold">
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {item.text ? <p className={item.lines ? "mt-1 text-sm text-mute" : undefined}>{item.text}</p> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DecisionCard({ decision }: { decision: LensEvent }) {
  const payload = decision.payload;
  const rounds = typeof payload.rounds === "number" ? payload.rounds : 0;
  const byAgents = payload.decided_by === "agents";
  const askHuman = payload.ask_human === true;
  const missing = Array.isArray(payload.missing_agents) ? (payload.missing_agents as string[]) : [];
  const without = missing.map((id) => agentInfo(id).name).join(", ");
  const unspoken = missing.flatMap((id) => (DIMENSION_OF[id] ? [dimensionLabel(DIMENSION_OF[id]).toLowerCase()] : []));
  const shopsGone = missing.filter((id) => agentKind(id) === "shop").map((id) => agentInfo(id).name);
  const lost = [
    unspoken.length ? `Nobody spoke for ${unspoken.join(" or ")}, so it counted for nothing this round.` : "",
    shopsGone.length ? `${shopsGone.join(" and ")} couldn't confirm stock, so ${shopsGone.length === 1 ? "its" : "their"} drinks were ruled out.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const who = byAgents ? "the agents agreed" : "the arbiter decided";
  const how = byAgents
    ? `They settled it themselves after ${rounds} ${rounds === 1 ? "round" : "rounds"} of back-and-forth.`
    : rounds > 0
      ? `No agreement after ${rounds} ${rounds === 1 ? "round" : "rounds"}, so the arbiter weighed everyone's final scores by your priorities.`
      : "It weighed every agent's scores by your priorities and removed anything a shop couldn't confirm.";

  return (
    <div className="timeline-in rounded-3xl border border-ink/80 bg-foam p-5">
      <p className="flex items-center gap-2 font-display text-2xl leading-none">
        <LeafPair className="h-6 w-6 shrink-0 text-moss" />
        {who}
        {without ? <span className="font-sans text-base text-[#8a3b2a]">without {without.toLowerCase()}</span> : null}
      </p>
      <p className="mt-2 text-sm text-mute">{how}</p>
      {lost ? <p className="mt-2 text-sm text-[#8a3b2a]">{lost}</p> : null}
      <p className="mt-3 text-[15px] leading-relaxed">{decision.message}</p>
      {askHuman ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sage px-4 py-3">
          <p className="text-[15px] font-semibold">It's too close to call, so you decide.</p>
          <Link to="/" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-foam">
            Order from today's picks
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function AgentTimeline({
  events,
  usingMock,
  started,
  health = null,
  busAgents = [],
  stopped = [],
  onToggleAgent,
}: {
  events: LensEvent[];
  usingMock: boolean;
  started: boolean;
  health?: Health | null;
  busAgents?: string[];
  stopped?: string[];
  onToggleAgent?: (agentId: string) => Promise<void>;
}) {
  const overBus = new Set(busAgents);
  const { items, selections, decision } = buildChat(events);

  if (events.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-[28px] border border-line bg-foam p-6 text-mute">
        <TeaBowl steaming className="h-7 w-7 shrink-0 text-moss" />
        {started ? "Calling the agents to the counter…" : "The round has not started."}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {selections.length > 0 ? (
        <section className="rounded-[28px] border border-line bg-foam p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl leading-none">the team</h2>
            {started || usingMock ? <TransportBadge health={health} busCount={busAgents.length} usingMock={usingMock} /> : null}
          </div>
          <TeamGrid selections={selections} overBus={overBus} stopped={stopped} onToggle={onToggleAgent} />
        </section>
      ) : null}

      <section className="rounded-[28px] border border-line bg-foam p-5 sm:p-6">
        <h2 className="mb-4 font-display text-2xl leading-none">they argue</h2>
        <Chat items={items} />
        {!decision ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-mute">
            <TeaBowl steaming className="h-5 w-5 text-moss" />
            still talking…
          </p>
        ) : null}
      </section>

      {decision ? <DecisionCard decision={decision} /> : null}
    </div>
  );
}
