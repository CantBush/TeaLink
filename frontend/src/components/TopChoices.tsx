import { Link } from "react-router-dom";
import type { Decision, RankedDrink } from "../api/types.ts";
import { topOptions } from "../lib/diff.ts";
import { DIMENSIONS, dimensionLabel, matchPercent, price, shopLabel } from "../lib/format.ts";

function ScoreRow({ option }: { option: RankedDrink }) {
  const scores = option.dimension_scores;
  if (!scores) return null;
  return (
    <ul className="mt-4 space-y-2">
      {DIMENSIONS.map((dimension) => (
        <li key={dimension} className="text-xs">
          <div className="mb-0.5 flex justify-between text-mute">
            <span>{dimensionLabel(dimension)}</span>
            <span>{matchPercent(scores[dimension] ?? 0)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#eadfce]">
            <div
              className="h-full rounded-full bg-amber"
              style={{ width: `${matchPercent(scores[dimension] ?? 0)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TopChoices({
  decision,
  running,
  onPick,
}: {
  decision: Decision | null;
  running: boolean;
  onPick: (option: RankedDrink) => void;
}) {
  if (!decision) {
    return (
      <article className="rounded-[28px] border border-line bg-foam p-6 sm:p-8">
        <p className="text-xs font-semibold tracking-[0.16em] text-amber uppercase">For Andrew</p>
        <h2 className="mt-4 font-display text-3xl text-ink">Steeping your top 3…</h2>
        <p className="mt-2 max-w-md text-mute">
          Taste, Social, Explorer, and Budget are arguing it out, and the shops are checking stock.
        </p>
      </article>
    );
  }

  const options = topOptions(decision);
  if (options.length === 0) {
    return (
      <article className="rounded-[28px] border border-amber bg-foam p-6 sm:p-8">
        <h2 className="font-display text-3xl">Nothing survived</h2>
        <p className="mt-2 text-mute">{decision.question ?? decision.explanation}</p>
      </article>
    );
  }

  return (
    <section className="rounded-[28px] border border-line bg-foam p-6 shadow-[0_16px_40px_rgba(44,24,16,0.06)] sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.16em] text-amber uppercase">Your top 3</p>
        <Link to="/why" className="text-sm font-semibold text-amber hover:text-ink">
          WHY THIS ORDER?
        </Link>
      </div>
      {decision.ask_human && decision.question ? (
        <p className="mt-3 rounded-2xl border border-amber/60 bg-[#f8efe2] px-4 py-3 text-sm">{decision.question}</p>
      ) : null}
      <ol className="mt-5 grid gap-4 md:grid-cols-3">
        {options.map((option, index) => (
          <li
            key={option.drink_id}
            className={`flex flex-col rounded-[22px] border p-4 ${
              index === 0 ? "border-amber bg-[#fbf4ea]" : "border-line bg-cream"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold text-mute">#{index + 1}</span>
              <span className="font-display text-xl text-amber">{matchPercent(option.score)}</span>
            </div>
            <h3 className="mt-1 font-display text-2xl leading-tight">{option.drink_name}</h3>
            <p className="mt-1 text-sm text-mute">
              {shopLabel(option.shop_id ?? decision.shop_id)}
              {price(option.price) ? ` · ${price(option.price)}` : ""}
            </p>
            <ScoreRow option={option} />
            <button
              type="button"
              disabled={running}
              onClick={() => onPick(option)}
              className="mt-4 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream disabled:opacity-40"
            >
              Pick this
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm leading-relaxed text-mute">{decision.explanation}</p>
    </section>
  );
}
