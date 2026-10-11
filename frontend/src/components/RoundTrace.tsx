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

const seconds = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

function Bar({ share, tone }: { share: number; tone: "bus" | "local" | "warn" }) {
  const color = tone === "bus" ? "bg-moss" : tone === "warn" ? "bg-[#c98a5a]" : "bg-[#aab6ad]";
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(3, Math.min(100, share * 100))}%` }} />
    </div>
  );
}

/** Inside the latest round: how long each agent took and how it was reached, for the AGNTCY story. */
export function RoundTrace() {
  const session = useSession();
  const [spans, setSpans] = useState<TraceSpan[] | null>(null);
  const decided = session.decision !== null;

  useEffect(() => {
    if (!decided) return;
    let cancelled = false;
    void getTrace(session.userId).then((result) => {
      if (!cancelled) setSpans(result && result.length ? result : null);
    });
    return () => {
      cancelled = true;
    };
  }, [decided, session.userId, session.round]);

  const selected = session.events.filter((event) => event.type === "selection" && event.agent_id).map((event) => event.agent_id!);
  const configuredBus = session.health?.transport === "agntcy";
  const overBus = new Set(session.busAgents);

  return (
    <section className="rounded-[28px] border border-line bg-foam p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl">Inside the last round</h2>
        {session.usingMock ? <span className="text-xs text-mute">saved round</span> : null}
      </div>
      <p className="mt-1 text-sm text-mute">
        How the team was reached: which agents answered over Cisco's AGNTCY bus, which fell back to in-process, and how
        long it all took.
      </p>

      {!session.started || selected.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line p-5 text-center text-sm text-mute">
          Run a round at the counter, then come back to see its trace.
        </p>
      ) : spans ? (
        <SpanTable spans={spans} />
      ) : (
        <>
          <ol className="mt-5 space-y-3">
            {session.phases.map((item, index) => {
              const previous = index > 0 ? session.phases[index - 1].ms : 0;
              const total = session.phases[session.phases.length - 1]?.ms || 1;
              return (
                <li key={item.phase} className="text-sm">
                  <div className="mb-1 flex justify-between gap-3">
                    <span className="font-semibold">{PHASE_LABEL[item.phase]}</span>
                    <span className="text-mute tabular-nums">
                      {seconds(item.ms)}
                      {index > 0 ? ` (+${seconds(item.ms - previous)})` : ""}
                    </span>
                  </div>
                  <Bar share={item.ms / total} tone="bus" />
                </li>
              );
            })}
          </ol>
          <ul className="mt-5 flex flex-wrap gap-2">
            {selected.map((id) => {
              const bus = overBus.has(id);
              const fell = configuredBus && !bus && id !== "preference";
              return (
                <li
                  key={id}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${
                    bus ? "bg-ink text-foam" : fell ? "bg-[#f6efe6] text-[#7a5326]" : "bg-sage"
                  }`}
                >
                  <AgentSymbol agentId={id} className="h-3.5 w-3.5" />
                  <span className="font-semibold">{agentInfo(id).name.toLowerCase()}</span>
                  <span className={bus ? "text-foam/70" : "text-mute"}>{bus ? "AGNTCY bus" : fell ? "fell back to in-process" : "in-process"}</span>
                </li>
              );
            })}
            {session.stopped.map((id) => (
              <li key={`x${id}`} className="flex items-center gap-1.5 rounded-full border border-dashed border-[#b4533c]/50 px-3 py-1.5 text-xs text-[#8a3b2a]">
                <AgentSymbol agentId={id} className="h-3.5 w-3.5" />
                <span className="font-semibold line-through">{agentInfo(id).name.toLowerCase()}</span>
                stopped
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-mute">
            Phase times are measured in the browser. Per-agent latency and retries appear here once the API serves its
            AGNTCY trace.
          </p>
        </>
      )}
    </section>
  );
}

function SpanTable({ spans }: { spans: TraceSpan[] }) {
  const latest = Math.max(...spans.map((span) => span.round));
  const rows = spans.filter((span) => span.round === latest).sort((a, b) => b.ms - a.ms);
  const slowest = Math.max(...rows.map((span) => span.ms), 1);
  return (
    <table className="mt-5 w-full text-sm">
      <thead className="text-left text-mute">
        <tr>
          <th className="py-1 font-semibold">Agent</th>
          <th className="w-1/2 py-1 font-semibold">Time</th>
          <th className="py-1 text-right font-semibold">Retries</th>
          <th className="py-1 text-right font-semibold">Transport</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((span) => (
          <tr key={span.agent_id} className="border-t border-line/70">
            <td className="py-2 font-semibold lowercase">{agentInfo(span.agent_id).name}</td>
            <td className="py-2 pr-3">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Bar share={span.ms / slowest} tone={span.fell_back ? "warn" : span.transport === "agntcy" ? "bus" : "local"} />
                </div>
                <span className="w-14 text-right text-xs text-mute tabular-nums">{seconds(span.ms)}</span>
              </div>
            </td>
            <td className="py-2 text-right tabular-nums">{span.retries}</td>
            <td className="py-2 text-right text-xs">
              {span.fell_back ? "fell back" : span.transport === "agntcy" ? "AGNTCY bus" : "in-process"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
