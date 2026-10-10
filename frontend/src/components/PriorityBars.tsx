import type { DimensionScores, PreferenceReport } from "../api/types.ts";
import { DIMENSIONS, dimensionLabel, matchPercent } from "../lib/format.ts";

export function PriorityBars({
  name,
  weights,
  summary,
  learned,
}: {
  name: string;
  weights: DimensionScores | null;
  summary: string | null;
  learned: PreferenceReport | null;
}) {
  const before = learned?.previous_weights ?? null;
  return (
    <section className="rounded-[28px] border border-line bg-foam p-6">
      <p className="text-xs font-semibold tracking-[0.16em] text-amber uppercase">What {name} cares about</p>
      <p className="mt-2 text-sm text-mute">
        Learned by the Preference agent from past picks (or the quiz, for new users) and every pick from the top 3.
      </p>
      {weights ? (
        <ul className="mt-4 space-y-3">
          {DIMENSIONS.map((dimension) => {
            const pct = matchPercent(weights[dimension] ?? 0);
            const was = before ? matchPercent(before[dimension] ?? 0) : null;
            const delta = was === null ? 0 : pct - was;
            return (
              <li key={dimension}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-semibold">{dimensionLabel(dimension)}</span>
                  <span className="text-mute">
                    {pct}%
                    {delta !== 0 ? (
                      <span className={delta > 0 ? "ml-1 text-amber" : "ml-1"}>
                        ({delta > 0 ? "+" : ""}
                        {delta})
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#eadfce]">
                  <div className="h-full rounded-full bg-amber transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-mute">Waiting for the Preference agent…</p>
      )}
      {learned ? (
        <p className="mt-4 rounded-2xl border border-amber/60 bg-[#f8efe2] px-4 py-3 text-sm">{learned.summary}</p>
      ) : summary ? (
        <p className="mt-4 text-sm">{summary}</p>
      ) : null}
    </section>
  );
}
