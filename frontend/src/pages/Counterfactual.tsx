import { useEffect } from "react";
import type { Decision } from "../api/types.ts";
import { ControlPanel } from "../components/ControlPanel.tsx";
import { TeaLinkTabs } from "../components/TeaLinkTabs.tsx";
import { type Movement, diffDecisions, topOptions } from "../lib/diff.ts";
import { dimensionLabel, matchPercent, price, readableShops, shopLabel } from "../lib/format.ts";
import { sampleSession } from "../mocks/sample.ts";
import { startRecommendation, useSession } from "../state/session.ts";

function MovementChip({ movement }: { movement: Movement }) {
  const base = "rounded-full px-2 py-0.5 text-xs font-semibold";
  switch (movement.kind) {
    case "new":
      return <span className={`${base} bg-moss text-cream`}>New</span>;
    case "up":
      return <span className={`${base} bg-sage text-moss`}>Up {movement.by}</span>;
    case "down":
      return <span className={`${base} bg-line text-mute`}>Down {movement.by}</span>;
    case "same":
      return <span className={`${base} text-mute`}>Same</span>;
  }
}

function Column({
  title,
  decision,
  highlight,
  movements,
}: {
  title: string;
  decision: Decision;
  highlight: boolean;
  movements?: Map<string, Movement>;
}) {
  return (
    <article
      className={`rounded-[28px] border p-6 ${highlight ? "border-moss bg-foam" : "border-line bg-cream"}`}
    >
      <p
        className={`text-xs font-semibold tracking-[0.14em] uppercase ${highlight ? "text-moss" : "text-mute"}`}
      >
        {title}
      </p>
      <ol className="mt-4 space-y-3">
        {topOptions(decision).map((option, index) => {
          const movement = movements?.get(option.drink_id);
          return (
            <li key={option.drink_id} className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl leading-tight">
                  <span className="mr-2 text-sm text-mute">#{index + 1}</span>
                  {option.drink_name}
                </p>
                <p className="text-sm text-mute">
                  {shopLabel(option.shop_id ?? decision.shop_id)}
                  {price(option.price) ? ` · ${price(option.price)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`font-display text-xl ${highlight ? "text-moss" : "text-ink"}`}>
                  {matchPercent(option.score)}
                </span>
                {movement ? <MovementChip movement={movement} /> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

export function Counterfactual() {
  const session = useSession();

  useEffect(() => {
    startRecommendation();
  }, []);

  const live = session.previousDecision !== null && session.decision !== null;
  const replanning = session.previousDecision !== null && session.decision === null;
  const script = sampleSession.counterfactual;
  const before = live ? session.previousDecision! : script.before;
  const after = live ? session.decision! : script.after;
  const change = live ? session.change : script.change;
  const diff = diffDecisions(before, after);
  const movements = new Map(diff.after.map((move) => [move.option.drink_id, move.movement]));

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-5 py-8">
      <TeaLinkTabs />
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-moss uppercase">What changed</p>
        <h1 className="mt-2 font-display text-4xl leading-tight">
          {change ?? "The agents re-planned"}
        </h1>
        {!live ? (
          <p className="mt-3 rounded-2xl border border-line bg-foam px-4 py-3 text-sm text-mute">
            {replanning
              ? "The agents are re-planning. The before/after appears when they finish."
              : "This is a recorded example. Pick a drink or press a what-if button below to see your own before and after."}
          </p>
        ) : null}
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <Column title="Before" decision={before} highlight={false} />
        <Column title="After" decision={after} highlight movements={movements} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-[28px] border border-line bg-foam p-6">
          <h2 className="font-display text-2xl">Left the top 3</h2>
          {diff.left.length === 0 ? (
            <p className="mt-3 text-sm text-mute">
              {diff.sameOrder ? "Nothing moved. The same three drinks, in the same order." : "Nothing left. The same drinks were reordered."}
            </p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {diff.left.map((item) => (
                <li key={item.option.drink_id}>
                  <span className="font-semibold">{item.option.drink_name}</span>
                  <span className="text-mute"> (was #{item.rank})</span>
                  <p className="text-mute">
                    {item.reason ? readableShops(item.reason) : "Not ruled out, but it now ranks below the top 3."}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-[28px] border border-line bg-foam p-6">
          <h2 className="font-display text-2xl">{session.name}'s priorities</h2>
          {diff.weights.length === 0 ? (
            <p className="mt-3 text-sm text-mute">
              Unchanged. The world changed, not what {session.name} cares about.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {diff.weights.map((shift) => {
                const delta = matchPercent(shift.after) - matchPercent(shift.before);
                return (
                  <li key={shift.dimension} className="flex items-baseline justify-between">
                    <span className="font-semibold">{dimensionLabel(shift.dimension)}</span>
                    <span className="text-mute">
                      {matchPercent(shift.before)}% → {matchPercent(shift.after)}%
                      <span className={delta > 0 ? "ml-1 text-moss" : "ml-1"}>
                        ({delta > 0 ? "+" : ""}
                        {delta})
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </article>
      </section>

      <p className="rounded-[28px] border border-line bg-foam px-6 py-5 text-lg leading-relaxed">
        {after.explanation}
      </p>

      <ControlPanel decision={session.decision} running={session.running} />
    </main>
  );
}
