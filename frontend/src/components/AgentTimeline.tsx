import type { LensEvent } from "../api/types.ts";
import { price } from "../lib/format.ts";

function detail(event: LensEvent): string | null {
  const payload = event.payload;
  if (event.type === "proposal" && typeof payload.rationale === "string") {
    const cost = typeof payload.price === "number" ? price(payload.price) : "";
    return cost ? `${payload.rationale} (${cost})` : payload.rationale;
  }
  return null;
}

function tone(event: LensEvent): string {
  if (event.type === "decision") return "border-amber bg-[#f8efe2]";
  if (event.type === "preference") return "border-amber/60 bg-[#fbf4ea]";
  if (event.type === "objection" && event.payload.kind === "veto") return "border-[#b4533c]/60 bg-[#fbeee9]";
  if (event.type === "status" && event.message.startsWith("Dropped")) return "border-[#b4533c]/40 bg-cream";
  return "border-line/80 bg-cream";
}

function label(event: LensEvent): string {
  if (event.type === "objection") {
    if (event.payload.kind === "veto") return "veto";
    return event.payload.kind === "concern" ? "pushback" : "review";
  }
  return event.type;
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
                className={`timeline-in rounded-2xl border px-4 py-3 ${tone(event)}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-amber uppercase">
                    {label(event)}
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
