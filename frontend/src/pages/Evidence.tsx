import { useEffect, useState } from "react";
import { client } from "../api/client.ts";
import type { EvalMethodName, EvalResult } from "../api/types.ts";
import { DIMENSIONS, dimensionLabel, matchPercent } from "../lib/format.ts";
import { sampleEval } from "../mocks/sample.ts";

const METHOD_LABELS: Record<EvalMethodName, string> = {
  popularity: "Most popular drink",
  fixed_weights: "Agent team, fixed priorities",
  learning: "Agent team, learned priorities",
};

const METHOD_NOTES: Record<EvalMethodName, string> = {
  popularity: "Baseline: recommends the most-reviewed in-stock drink the user hasn't tried.",
  fixed_weights: "Same agents, but every user gets the default priorities.",
  learning: "The Preference agent updates priorities after every pick.",
};

function Bar({ value, tone }: { value: number; tone: "strong" | "soft" }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-[#eadfce]">
      <div
        className={`h-full rounded-full ${tone === "strong" ? "bg-amber" : "bg-[#b7a89a]"}`}
        style={{ width: `${Math.min(100, matchPercent(value))}%` }}
      />
    </div>
  );
}

export function Evidence() {
  const [result, setResult] = useState<EvalResult>(sampleEval);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client
      .getEval()
      .then((data) => {
        if (cancelled) return;
        setResult(data);
        setLive(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const byName = new Map(result.methods.map((method) => [method.method, method]));
  const learning = byName.get("learning");
  const fixed = byName.get("fixed_weights");
  const popularity = byName.get("popularity");

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-5 py-8">
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-amber uppercase">Evidence</p>
        <h1 className="mt-2 font-display text-4xl leading-tight">Does the team learn what you want?</h1>
        <p className="mt-2 max-w-2xl text-mute">
          Simulated users with hidden priorities each pick from the top 3 for {result.rounds} rounds. A hit means
          the team's #1 was the drink they picked.
        </p>
        {!live ? (
          <p className="mt-3 rounded-2xl border border-amber/60 bg-[#f8efe2] px-4 py-3 text-sm">
            Preview data. The backend's <code>/eval</code> endpoint isn't live yet. The hit rates for fixed vs
            learned priorities and the persona weights come from the current eval run; the popularity row and the
            other columns are placeholders.
          </p>
        ) : null}
      </header>

      {learning && fixed ? (
        <section className="rounded-[28px] border border-amber bg-foam p-6 sm:p-8">
          <p className="font-display text-3xl leading-snug">
            With learning, the team's #1 was the user's pick{" "}
            <span className="text-amber">{matchPercent(learning.hit_rate)}%</span> of the time, vs{" "}
            {matchPercent(fixed.hit_rate)}% with fixed priorities
            {live && popularity ? ` and ${matchPercent(popularity.hit_rate)}% for the most popular drink` : ""}.
          </p>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-line bg-foam p-6">
        <h2 className="font-display text-2xl">Recommenders compared</h2>
        <div className="mt-4 space-y-5">
          {result.methods.map((method) => (
            <div key={method.method}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold">{METHOD_LABELS[method.method]}</span>
                <span className="text-mute">{matchPercent(method.hit_rate)}% hits</span>
              </div>
              <Bar value={method.hit_rate} tone={method.method === "learning" ? "strong" : "soft"} />
              <p className="mt-1 text-xs text-mute">{METHOD_NOTES[method.method]}</p>
            </div>
          ))}
        </div>
        <table className="mt-6 w-full text-sm">
          <thead className="text-left text-mute">
            <tr>
              <th className="py-1 font-semibold">Recommender</th>
              <th className="py-1 text-right font-semibold">#1 was picked</th>
              <th className="py-1 text-right font-semibold">Pick in top 3</th>
              <th className="py-1 text-right font-semibold">Sold-out recs</th>
              <th className="py-1 text-right font-semibold">Already tried</th>
            </tr>
          </thead>
          <tbody>
            {result.methods.map((method) => (
              <tr key={method.method} className="border-t border-line/70">
                <td className="py-2 font-semibold">{METHOD_LABELS[method.method]}</td>
                <td className="py-2 text-right">{matchPercent(method.hit_rate)}%</td>
                <td className="py-2 text-right">{matchPercent(method.top3_rate)}%</td>
                <td className="py-2 text-right">{method.sold_out_recs}</td>
                <td className="py-2 text-right">{matchPercent(method.repeat_rate)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl">Hidden priorities vs what the Preference agent learned</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {result.personas.map((persona) => (
            <article key={persona.name} className="rounded-[28px] border border-line bg-foam p-5">
              <h3 className="font-display text-xl">{persona.name}</h3>
              <ul className="mt-3 space-y-3">
                {DIMENSIONS.map((dimension) => (
                  <li key={dimension} className="text-xs">
                    <div className="mb-1 flex justify-between">
                      <span className="font-semibold">{dimensionLabel(dimension)}</span>
                      <span className="text-mute">
                        {matchPercent(persona.hidden_weights[dimension])}% hidden ·{" "}
                        {matchPercent(persona.learned_weights[dimension])}% learned
                      </span>
                    </div>
                    <div className="space-y-1">
                      <Bar value={persona.hidden_weights[dimension]} tone="soft" />
                      <Bar value={persona.learned_weights[dimension]} tone="strong" />
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className="text-xs text-mute">Grey: the user's hidden priority. Amber: what the agent learned from picks alone.</p>
      </section>
    </main>
  );
}
