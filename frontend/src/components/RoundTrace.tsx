import { useEffect, useState } from "react";
import { getTrace } from "../api/agents.ts";
import type { TraceSpan } from "../api/types.ts";
import { agentInfo } from "../lib/agents.ts";
import type { Phase } from "../state/session.ts";
import { useSession } from "../state/session.ts";
import { AgentSymbol } from "./AgentSymbol.tsx";

const PHASE_LABEL: Record<Phase, string> = {
  selected: "team picked",
  proposed: "opening picks in",
  scored: "everyone's scores in",
  decided: "decision",
};

const time = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

type Tone = "bus" | "local" | "warn";

const toneOf = (span: Pick<TraceSpan, "transport" | "fell_back">): Tone =>
  span.fell_back ? "warn" : span.transport === "agntcy" ? "bus" : "local";

const TRANSPORT_LABEL: Record<Tone, string> = { bus: "AGNTCY bus", local: "in-process", warn: "fell back to in-process" };

function Bar({ share, tone }: { share: number; tone: Tone }) {
  const color = tone === "bus" ? "bg-moss" : tone === "warn" ? "bg-[#c98a5a]" : "bg-[#aab6ad]";
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(3, Math.min(100, share * 100))}%` }} />
    </div>
  );
}

function roundLabel(round: number, last: number, hasOffer: boolean): string {
  if (round === 0) return "opening picks";
  if (round === 1) return "round 1 · everyone scores the shortlist";
  if (hasOffer && round === last) return "close-call offer";
  return `rebuttal ${round - 1}`;
}

/** Inside the latest round: how long each teagent took and how it was reached, for the AGNTCY story. */
export function RoundTrace() {
  const session = useSession();
  const [trace, setTrace] = useState<{ sessionId: string; spans: TraceSpan[] } | null>(null);
  const { sessionId, running } = session;

  useEffect(() => {
    if (!sessionId || running) return;
    let cancelled = false;
    void getTrace(sessionId).then((spans) => {
      if (!cancelled && spans?.length) setTrace({ sessionId, spans });
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, running]);

  const spans = trace && trace.sessionId === sessionId ? trace.spans : null;
  const selected = session.events.filter((event) => event.type === "selection" && event.agent_id).map((event) => event.agent_id!);
  const hasOffer = session.events.some((event) => event.type === "offer");

  return (
    <section className="rounded-[28px] border border-line bg-foam p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl">Inside the last round</h2>
        {session.usingMock ? <span className="text-xs text-mute">saved round</span> : null}
      </div>
      <p className="mt-1 text-sm text-mute">
        Every call from the concierge to a teagent, traced: how long it took, how many retries, and whether it went over
        Cisco's AGNTCY bus or fell back to in-process.
      </p>

      {!session.started || selected.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line p-5 text-center text-sm text-mute">
          Run a round at the counter, then come back to see its trace.
        </p>
      ) : spans ? (
        <SpanView spans={spans} hasOffer={hasOffer} stopped={session.stopped} />
      ) : (
        <PhaseView />
      )}
    </section>
  );
}

function SpanView({ spans, hasOffer, stopped }: { spans: TraceSpan[]; hasOffer: boolean; stopped: string[] }) {
  const rounds = [...new Set(spans.map((span) => span.round))].sort((a, b) => a - b);
  const last = rounds[rounds.length - 1];
  const slowest = Math.max(...spans.map((span) => span.ms), 1);
  const agents = new Set(spans.map((span) => span.agent_id));
  const overBus = spans.filter((span) => toneOf(span) === "bus").length;
  const retries = spans.reduce((sum, span) => sum + span.retries, 0);
  const fellBack = spans.filter((span) => span.fell_back).length;
  const total = spans.reduce((sum, span) => sum + span.ms, 0);

  return (
    <>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        {[
          [`${agents.size}`, "teagents"],
          [`${overBus} of ${spans.length}`, "calls over AGNTCY"],
          [`${retries}`, retries === 1 ? "retry" : "retries"],
          [`${fellBack}`, fellBack === 1 ? "fallback" : "fallbacks"],
        ].map(([value, label]) => (
          <div key={label} className="rounded-2xl bg-sage px-3 py-3">
            <dt className="text-xs text-mute">{label}</dt>
            <dd className="font-display text-2xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 space-y-5">
        {rounds.map((round) => (
          <div key={round}>
            <h3 className="mb-2 text-xs font-semibold tracking-[0.08em] text-mute uppercase">
              {roundLabel(round, last, hasOffer)}
            </h3>
            <ul className="space-y-1.5">
              {spans
                .filter((span) => span.round === round)
                .map((span, index) => {
                  const tone = toneOf(span);
                  return (
                    <li key={`${span.agent_id}-${index}`} className="grid grid-cols-[8.5rem_1fr_4rem] items-center gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5 font-semibold lowercase">
                        <AgentSymbol agentId={span.agent_id} className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{agentInfo(span.agent_id).name}</span>
                      </span>
                      <span title={`${TRANSPORT_LABEL[tone]}${span.retries ? `, ${span.retries} retries` : ""}`}>
                        <Bar share={span.ms / slowest} tone={tone} />
                      </span>
                      <span className="text-right text-xs text-mute tabular-nums">
                        {time(span.ms)}
                        {span.retries ? ` ↻${span.retries}` : ""}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-mute">
        {(["bus", "local", "warn"] as Tone[]).map((tone) => (
          <span key={tone} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${tone === "bus" ? "bg-moss" : tone === "warn" ? "bg-[#c98a5a]" : "bg-[#aab6ad]"}`} />
            {TRANSPORT_LABEL[tone]}
          </span>
        ))}
        <span>· {time(total)} of teagent time in all</span>
        {stopped.length ? (
          <span className="text-[#8a3b2a]">· not called: {stopped.map((id) => agentInfo(id).name.toLowerCase()).join(", ")}</span>
        ) : null}
      </div>
    </>
  );
}

/** Without a server trace (a saved round, or an older API): phase timings from the browser. */
function PhaseView() {
  const session = useSession();
  const selected = session.events.filter((event) => event.type === "selection" && event.agent_id).map((event) => event.agent_id!);
  const configuredBus = session.health?.transport === "agntcy";
  const overBus = new Set(session.busAgents);
  const total = session.phases[session.phases.length - 1]?.ms || 1;

  return (
    <>
      <ol className="mt-5 space-y-3">
        {session.phases.map((item, index) => {
          const previous = index > 0 ? session.phases[index - 1].ms : 0;
          return (
            <li key={item.phase} className="text-sm">
              <div className="mb-1 flex justify-between gap-3">
                <span className="font-semibold">{PHASE_LABEL[item.phase]}</span>
                <span className="text-mute tabular-nums">
                  {time(item.ms)}
                  {index > 0 ? ` (+${time(item.ms - previous)})` : ""}
                </span>
              </div>
              <Bar share={item.ms / total} tone="bus" />
            </li>
          );
        })}
      </ol>
      <ul className="mt-5 flex flex-wrap gap-2">
        {selected.map((id) => {
          const tone: Tone = overBus.has(id) ? "bus" : configuredBus && id !== "preference" ? "warn" : "local";
          return (
            <li
              key={id}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${
                tone === "bus" ? "bg-ink text-foam" : tone === "warn" ? "bg-[#f6efe6] text-[#7a5326]" : "bg-sage"
              }`}
            >
              <AgentSymbol agentId={id} className="h-3.5 w-3.5" />
              <span className="font-semibold">{agentInfo(id).name.toLowerCase()}</span>
              <span className={tone === "bus" ? "text-foam/70" : "text-mute"}>{TRANSPORT_LABEL[tone]}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-mute">
        {session.usingMock
          ? "This is a saved round, so there's no live trace. Phase times are measured in the browser."
          : "The API didn't return a trace for this round, so these phase times are measured in the browser."}
      </p>
    </>
  );
}
