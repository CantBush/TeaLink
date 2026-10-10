import type { LensEvent } from "../api/types.ts";
import { factorLabel, matchPercent } from "../lib/format.ts";

function detail(event: LensEvent): string | null {
  const payload = event.payload;
  if (event.type === "selection" && typeof payload.reason === "string") {
    return payload.reason;
  }
  if (event.type === "objection" && typeof payload.reason === "string") {
    const kind = typeof payload.kind === "string" ? payload.kind : "note";
    return `${factorLabel(kind)}: ${payload.reason}`;
  }
  if (event.type === "proposal" && typeof payload.rationale === "string") {
    const score = typeof payload.score === "number" ? matchPercent(payload.score) : null;
    return score === null ? payload.rationale : `${score}% match. ${payload.rationale}`;
  }
  if (event.type === "decision" && typeof payload.explanation === "string") {
    return payload.explanation;
  }
  return null;
}

export function AgentTimeline({
  events,
  usingMock,
  started,
}: {
  events: LensEvent[];
  usingMock: boolean;
  started: boolean;
}) {
  return (
    <section className="rounded-[28px] border border-line bg-foam/80 p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl">At the counter</h2>
        <p className="text-xs text-mute">
          {usingMock ? "Saved round" : started ? "Live" : "Waiting"}
        </p>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-mute">
          {started ? "Asking the counter…" : "The round has not started."}
        </p>
      ) : (
        <ol className="space-y-3">
          {events.map((event) => {
            const extra = detail(event);
            return (
              <li
                key={event.seq}
                className={`timeline-in rounded-2xl border px-4 py-3 ${
                  event.type === "decision"
                    ? "border-amber bg-[#f8efe2]"
                    : "border-line/80 bg-cream"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-amber uppercase">
                    {event.type}
                    {event.agent_id ? ` · ${event.agent_id}` : ""}
                  </p>
                  <span className="text-xs text-mute">{event.seq}</span>
                </div>
                <p className="mt-1 font-semibold">{event.message}</p>
                {extra ? <p className="mt-1 text-sm leading-relaxed text-mute">{extra}</p> : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
