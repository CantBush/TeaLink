import { Link } from "react-router-dom";
import type { Decision, FactorContribution, Proposal } from "../api/types.ts";
import { TeaLinkTabs } from "../components/TeaLinkTabs.tsx";
import { DIMENSIONS, dimensionLabel, factorLabel, matchPercent, readableShops, shopLabel } from "../lib/format.ts";
import { sampleDecision, sampleProposal } from "../mocks/sample.ts";
import { useSession } from "../state/session.ts";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <svg
          key={index}
          viewBox="0 0 20 20"
          className={`h-4 w-4 ${index < rating ? "text-moss" : "text-line"}`}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M10 1.8 12.4 7l5.6.5-4.2 3.7 1.3 5.5L10 13.8 4.9 16.7 6.2 11.2 2 7.5 7.6 7 10 1.8z" />
        </svg>
      ))}
    </span>
  );
}

function FactorBars({ factors }: { factors: FactorContribution[] }) {
  const max = Math.max(...factors.map((factor) => Math.abs(factor.weight)), 0.01);
  return (
    <ul className="space-y-3">
      {factors.map((factor) => {
        const width = Math.min(100, (Math.abs(factor.weight) / max) * 100);
        const positive = factor.weight >= 0;
        return (
          <li key={factor.factor}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-semibold">{factorLabel(factor.factor)}</span>
              <span className={positive ? "text-moss" : "text-mute"}>
                {positive ? "+" : ""}
                {factor.weight.toFixed(2)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-line">
              <div
                className={`h-full rounded-full ${positive ? "bg-moss" : "bg-[#aab6ad]"}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PriorityMath({ decision }: { decision: Decision }) {
  const top = decision.options?.[0];
  const weights = decision.weights;
  if (!top?.dimension_scores || !weights) return null;
  const scores = top.dimension_scores;
  return (
    <section className="rounded-[28px] border border-line bg-foam p-6">
      <h2 className="font-display text-2xl">How your priorities ranked it</h2>
      <p className="mt-1 text-sm text-mute">
        Each agent scores the drink on its own objective. Your learned weights decide how much each one counts.
      </p>
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-mute">
          <tr>
            <th className="py-1 font-semibold">Agent's objective</th>
            <th className="py-1 text-right font-semibold">Score</th>
            <th className="py-1 text-right font-semibold">Your weight</th>
            <th className="py-1 text-right font-semibold">Adds</th>
          </tr>
        </thead>
        <tbody>
          {DIMENSIONS.map((dimension) => (
            <tr key={dimension} className="border-t border-line/70">
              <td className="py-2 font-semibold">{dimensionLabel(dimension)}</td>
              <td className="py-2 text-right">{matchPercent(scores[dimension])}</td>
              <td className="py-2 text-right">{matchPercent(weights[dimension])}%</td>
              <td className="py-2 text-right text-moss">
                {(scores[dimension] * weights[dimension] * 100).toFixed(0)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-ink/20 font-semibold">
            <td className="py-2" colSpan={3}>
              Overall
            </td>
            <td className="py-2 text-right text-moss">{matchPercent(top.score)}</td>
          </tr>
        </tbody>
      </table>
      {decision.dropped && decision.dropped.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold tracking-wide text-moss lowercase">Ruled out</h3>
          <ul className="mt-2 space-y-1 text-sm text-mute">
            {decision.dropped.map((item) => (
              <li key={item.drink_id}>
                <span className="font-semibold text-ink">{item.drink_name}</span>: {readableShops(item.reason)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function WhyThis() {
  const session = useSession();
  const fallback = sampleDecision();
  const decision = session.decision ?? fallback;
  const forDrink = session.proposals.filter((proposal) => proposal.drink_id === decision.drink_id);
  const liveProposal =
    forDrink.find((proposal) => proposal.agent_id === "taste") ??
    forDrink.find((proposal) => proposal.evidence.length > 0) ??
    forDrink[0];
  const proposal: Proposal | null = liveProposal ?? sampleProposal(decision.drink_id);
  const pct = matchPercent(decision.score);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <TeaLinkTabs />
      <header className="rounded-[28px] border border-line bg-foam p-6 sm:p-8">
        <p className="text-xs font-semibold tracking-[0.16em] text-moss lowercase">
          Why this
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl leading-tight">{decision.drink_name}</h1>
            <p className="mt-2 text-mute">at {shopLabel(decision.shop_id)}</p>
          </div>
          <p className="font-display text-5xl text-moss">{pct}%</p>
        </div>
        <p className="mt-5 max-w-xl leading-relaxed">{decision.explanation}</p>
        {proposal ? (
          <p className="mt-3 text-sm text-mute">{proposal.rationale}</p>
        ) : null}
      </header>

      <PriorityMath decision={decision} />

      {proposal ? (
        <section className="rounded-[28px] border border-line bg-foam p-6">
          <h2 className="font-display text-2xl">What pulled it forward</h2>
          <div className="mt-4">
            <FactorBars factors={proposal.factors} />
          </div>
        </section>
      ) : null}

      {proposal && proposal.evidence.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-2xl">From the reviews</h2>
          {proposal.evidence.map((item) => (
            <article
              key={item.review_id}
              className="rounded-[24px] border border-line bg-foam p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Stars rating={item.rating} />
                <p className="text-sm font-semibold">{item.drink_name}</p>
              </div>
              <blockquote className="mt-3 text-lg leading-relaxed italic">
                “{item.text}”
              </blockquote>
            </article>
          ))}
        </section>
      ) : null}

      <Link
        to="/counter"
        className="inline-flex rounded-full bg-moss px-5 py-2.5 text-sm font-semibold tracking-wide text-cream"
      >
        what would change this?
      </Link>
    </main>
  );
}
