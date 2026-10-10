import { Link } from "react-router-dom";
import { matchPercent } from "../lib/format.ts";
import { sampleSession } from "../mocks/sample.ts";

export function Counterfactual() {
  const script = sampleSession.counterfactual;
  const fromPct = matchPercent(script.from);
  const toPct = matchPercent(script.to);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <Link to="/why" className="text-sm font-semibold text-mute hover:text-ink">
        Back to Why this
      </Link>
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-amber uppercase">
          Counterfactual
        </p>
        <h1 className="mt-2 font-display text-4xl">If that preference moved</h1>
      </header>

      <section className="rounded-[28px] border border-line bg-foam p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl">{script.preference_label}</h2>
          <p className="text-sm text-mute">
            {fromPct}% → {toPct}%
          </p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div>
            <p className="mb-1 text-sm font-semibold">High</p>
            <div className="h-3 overflow-hidden rounded-full bg-[#eadfce]">
              <div className="h-full rounded-full bg-amber" style={{ width: `${fromPct}%` }} />
            </div>
          </div>
          <span className="hidden text-mute sm:block" aria-hidden="true">
            →
          </span>
          <div>
            <p className="mb-1 text-sm font-semibold">Zero</p>
            <div className="h-3 overflow-hidden rounded-full bg-[#eadfce]">
              <div className="h-full rounded-full bg-[#b7a89a]" style={{ width: `${Math.max(toPct, 0)}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-[28px] border border-line bg-cream p-6">
          <p className="text-xs font-semibold tracking-[0.14em] text-mute uppercase">Before</p>
          <h2 className="mt-3 font-display text-3xl leading-tight">{script.before.drink_name}</h2>
          <p className="mt-3 font-display text-4xl text-ink">
            {matchPercent(script.before.score)}%
          </p>
        </article>
        <article className="rounded-[28px] border border-amber bg-foam p-6">
          <p className="text-xs font-semibold tracking-[0.14em] text-amber uppercase">After</p>
          <h2 className="mt-3 font-display text-3xl leading-tight">{script.after.drink_name}</h2>
          <p className="mt-3 font-display text-4xl text-amber">
            {matchPercent(script.after.score)}%
          </p>
        </article>
      </section>

      <p className="rounded-[28px] border border-line bg-foam px-6 py-5 text-lg leading-relaxed">
        {script.why}
      </p>
    </main>
  );
}
