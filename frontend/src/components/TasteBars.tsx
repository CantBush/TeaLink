import type { TasteProfile } from "../api/types.ts";
import { TASTE_ORDER, attributeLabel, matchPercent } from "../lib/format.ts";

export function TasteBars({ profile }: { profile: TasteProfile }) {
  return (
    <ul className="space-y-3">
      {TASTE_ORDER.map((key) => {
        const pct = matchPercent(profile[key] ?? 0);
        return (
          <li key={key}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-semibold">{attributeLabel(key)}</span>
              <span className="text-mute">{pct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-amber"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
