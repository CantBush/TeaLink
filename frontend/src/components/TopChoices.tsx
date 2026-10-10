import { Link } from "react-router-dom";
import type { Decision, Dimension, RankedDrink } from "../api/types.ts";
import { topOptions } from "../lib/diff.ts";
import { drinkInfo } from "../lib/catalog.ts";
import { DIMENSIONS, dimensionLabel, matchPercent, price, readableShops, shopLabel } from "../lib/format.ts";
import { drinkPhoto } from "../lib/images.ts";

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
    <div className="mt-4 rounded-3xl bg-blush p-4 sm:p-5">
      <p className="font-semibold">
        Close call: {a.drink_name} {matchPercent(a.score)} vs {b.drink_name} {matchPercent(b.score)}.
      </p>
      <p className="mt-1 text-[15px] text-mute">
        The agents can't separate these two, so they're asking you. Your pick also teaches the Preference agent
        which priority matters more.
      </p>
      <div className="mt-3 grid gap-3 @lg:grid-cols-2">
        {[
          [a, b],
          [b, a],
        ].map(([winner, loser]) => (
          <div key={winner.drink_id} className="flex min-w-0 flex-col rounded-2xl bg-foam p-4">
            <p className="font-display text-lg leading-snug">{winner.drink_name}</p>
            <EdgeList winner={winner} loser={loser} />
            <button
              type="button"
              disabled={running}
              onClick={() => onPick(winner)}
              className="mt-3 min-h-10 self-start rounded-full bg-ink px-4 py-2 text-left text-sm font-semibold text-foam disabled:opacity-40"
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
    <ul className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 @lg:grid-cols-1">
      {DIMENSIONS.map((dimension) => (
        <li key={dimension} className="min-w-0 text-xs">
          <div className="mb-0.5 flex justify-between gap-2 text-mute">
            <span className="truncate">{dimensionLabel(dimension)}</span>
            <span>{matchPercent(scores[dimension] ?? 0)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
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
  name,
  decision,
  running,
  onPick,
}: {
  name: string;
  decision: Decision | null;
  running: boolean;
  onPick: (option: RankedDrink) => void;
}) {
  if (!decision) {
    return (
      <article className="rounded-[28px] border border-line bg-foam p-6 sm:p-8">
        <p className="font-hand text-2xl leading-none lowercase text-amber">for {name}</p>
        <h2 className="mt-3 font-display text-3xl text-ink">Steeping your top 3…</h2>
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
        <p className="font-hand text-2xl leading-none lowercase">your top 3</p>
        <h2 className="mt-3 font-display text-3xl">Nothing survived</h2>
        <p className="mt-2 text-mute">{decision.explanation}</p>
        {decision.question ? (
          <p className="mt-4 rounded-2xl border border-amber/60 bg-petal px-4 py-3 text-sm">{decision.question}</p>
        ) : null}
        <p className="mt-4 text-sm text-mute">
          Rather than recommend something nobody can confirm, the team is asking you. Reset demo brings the shops back.
        </p>
      </article>
    );
  }

  return (
    <section className="@container rounded-[28px] border border-line bg-foam p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-hand text-3xl leading-none lowercase">your top 3</h2>
        <Link to="/why" className="text-sm tracking-[0.08em] text-ink/70 lowercase underline-offset-4 hover:text-ink hover:underline">
          why this order?
        </Link>
      </div>
      {decision.ask_human && options.length >= 2 ? (
        <CloseCall a={options[0]} b={options[1]} running={running} onPick={onPick} />
      ) : decision.ask_human && decision.question ? (
        <p className="mt-3 rounded-2xl border border-amber/60 bg-petal px-4 py-3 text-sm">{decision.question}</p>
      ) : null}
      <ol className="mt-5 grid gap-3 @lg:grid-cols-3">
        {options.map((option, index) => (
          <li
            key={option.drink_id}
            className={`flex min-w-0 flex-col rounded-[22px] border p-4 ${
              index === 0 ? "border-ink bg-petal" : "border-line bg-foam"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs tracking-[0.12em] text-mute">no. {index + 1}</span>
              <span className="font-display text-2xl leading-none text-amber">{matchPercent(option.score)}</span>
            </div>
            <div className="mt-2 flex min-w-0 items-center gap-3 @lg:flex-col @lg:items-start">
              {drinkPhoto(option.drink_id) ? (
                <img
                  src={drinkPhoto(option.drink_id)!}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-2xl bg-cream object-cover @lg:h-20 @lg:w-20"
                />
              ) : null}
              <h3 className="min-w-0 font-display text-xl leading-snug @lg:text-[19px]">{option.drink_name}</h3>
            </div>
            <p className="mt-2 text-sm text-mute">
              {shopLabel(option.shop_id ?? decision.shop_id)}
              {price(option.price) ? ` · ${price(option.price)}` : ""}
              {option.offer && drinkInfo(option.drink_id) ? (
                <span className="ml-1 line-through">{price(drinkInfo(option.drink_id)!.price)}</span>
              ) : null}
            </p>
            {option.offer ? (
              <p
                className="mt-2 self-start rounded-full bg-[#3f7d58] px-3 py-1 text-xs font-semibold text-foam"
                title={readableShops(option.offer.reason)}
              >
                {option.offer.percent}% off from {shopLabel(option.offer.shop_id)}
              </p>
            ) : null}
            <ScoreRow option={option} />
            <div className="mt-auto pt-4">
              <button
                type="button"
                disabled={running}
                onClick={() => onPick(option)}
                className="min-h-10 w-full rounded-full bg-ink px-4 py-2 text-sm font-semibold text-foam disabled:opacity-40"
              >
                Pick this
              </button>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[15px] leading-relaxed text-mute">{decision.explanation}</p>
    </section>
  );
}
