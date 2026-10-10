import { Link } from "react-router-dom";
import { matchPercent, shopLabel } from "../lib/format.ts";

export function RecommendationCard({
  drinkName,
  score,
  shopId,
  ready,
  note,
  onElse,
}: {
  drinkName: string;
  score: number;
  shopId: string;
  ready: boolean;
  note?: string;
  onElse: () => void;
}) {
  const pct = matchPercent(score);
  return (
    <article className="rounded-[28px] border border-line bg-foam p-6 shadow-[0_16px_40px_rgba(44,24,16,0.06)] sm:p-8">
      <p className="text-xs font-semibold tracking-[0.16em] text-amber uppercase">
        For Andrew
      </p>
      {ready ? (
        <>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-4xl leading-tight text-ink">
                {drinkName}
              </h2>
              <p className="mt-2 text-mute">at {shopLabel(shopId)}</p>
            </div>
            <div className="grid h-20 w-20 place-items-center rounded-full border-4 border-amber bg-cream">
              <span className="font-display text-2xl">{pct}%</span>
            </div>
          </div>
          {note ? <p className="mt-4 text-sm text-mute">{note}</p> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/why"
              className="rounded-full bg-amber px-5 py-2.5 text-sm font-semibold tracking-wide text-cream"
            >
              WHY THIS?
            </Link>
            <button
              type="button"
              onClick={onElse}
              className="rounded-full border border-ink/15 bg-cream px-5 py-2.5 text-sm font-semibold tracking-wide text-ink"
            >
              TRY SOMETHING ELSE
            </button>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <h2 className="font-display text-3xl text-ink">Steeping a pick…</h2>
          <p className="mt-2 max-w-md text-mute">
            The counter is still hearing from taste, friends, and the shop.
          </p>
        </div>
      )}
    </article>
  );
}
