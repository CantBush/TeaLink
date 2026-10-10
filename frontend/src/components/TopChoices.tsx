import { Link } from "react-router-dom";
import type { Decision, Dimension, RankedDrink } from "../api/types.ts";
import { topOptions } from "../lib/diff.ts";
import { DIMENSIONS, dimensionLabel, matchPercent, price, shopLabel } from "../lib/format.ts";

/** Score gaps below this aren't worth calling out as a trade-off. */
const EDGE_MIN = 0.05;

/** Dimensions where `a` beats `b`, biggest gap first. */
function edges(a: RankedDrink, b: RankedDrink): Dimension[] {
  const sa = a.dimension_scores;
  const sb = b.dimension_scores;
  if (!sa || !sb) return [];
  return DIMENSIONS.filter((dimension) => sa[dimension] - sb[dimension] >= EDGE_MIN).sort(
    (x, y) => sa[y] - sb[y] - (sa[x] - sb[x]),
  );
}

function EdgeList({ winner, loser }: { winner: RankedDrink; loser: RankedDrink }) {
  const wins = edges(winner, loser);
  if (wins.length === 0) return <p className="text-sm text-mute">No clear edge on any one priority.</p>;
  return (
    <ul className="text-sm">
      {wins.map((dimension) => (
        <li key={dimension}>
          Wins on <span className="font-semibold">{dimensionLabel(dimension).toLowerCase()}</span>{" "}
          <span className="text-mute">
            ({matchPercent(winner.dimension_scores![dimension])} vs {matchPercent(loser.dimension_scores![dimension])})
          </span>
        </li>
      ))}
    </ul>
  );
}

function CloseCall({
  a,
  b,
  running,
  onPick,
}: {
  a: RankedDrink;
  b: RankedDrink;
  running: boolean;
  onPick: (option: RankedDrink) => void;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-amber/60 bg-[#f8efe2] p-4">
      <p className="font-semibold">
        Close call: {a.drink_name} {matchPercent(a.score)} vs {b.drink_name} {matchPercent(b.score)}.
      </p>
      <p className="mt-1 text-sm text-mute">
        The agents can't separate these two, so they're asking you. Your pick also teaches the Preference agent
        which priority matters more.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {[
          [a, b],
          [b, a],
        ].map(([winner, loser]) => (
          <div key={winner.drink_id} className="rounded-xl bg-foam p-3">
            <p className="font-display text-lg">{winner.drink_name}</p>
            <EdgeList winner={winner} loser={loser} />
            <button
              type="button"
              disabled={running}
              onClick={() => onPick(winner)}
              className="mt-2 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-cream disabled:opacity-40"
            >
              I'd take {winner.drink_name}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

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
        <p className="text-xs font-semibold tracking-[0.16em] text-amber uppercase">Your top 3</p>
        <h2 className="mt-3 font-display text-3xl">Nothing survived</h2>
        <p className="mt-2 text-mute">{decision.explanation}</p>
        {decision.question ? (
          <p className="mt-4 rounded-2xl border border-amber/60 bg-[#f8efe2] px-4 py-3 text-sm">{decision.question}</p>
        ) : null}
        <p className="mt-4 text-sm text-mute">
          Rather than recommend something nobody can confirm, the team is asking you. Reset demo brings the shops back.
        </p>
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
      {decision.ask_human && options.length >= 2 ? (
        <CloseCall a={options[0]} b={options[1]} running={running} onPick={onPick} />
      ) : decision.ask_human && decision.question ? (
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
