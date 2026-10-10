import type { Decision } from "../api/types.ts";
import { client } from "../api/client.ts";
import { shopLabel } from "../lib/format.ts";
import { getSession, pushStatus, rerun, resetAll } from "../state/session.ts";

const button =
  "rounded-full border border-ink/15 bg-cream px-4 py-2 text-sm font-semibold disabled:opacity-40";

async function act(action: () => Promise<unknown>, note: string) {
  try {
    await action();
    rerun(note);
  } catch {
    pushStatus(`${note} (the API did not answer)`);
  }
}

export function ControlPanel({ decision, running }: { decision: Decision | null; running: boolean }) {
  const top = decision?.options?.[0] ?? null;
  const topShop = top?.shop_id ?? decision?.shop_id ?? "";

  return (
    <section className="rounded-[28px] border border-line bg-foam p-5 sm:p-6">
      <h2 className="font-display text-2xl">What if</h2>
      <p className="mt-1 text-sm text-mute">
        Change the world, then watch the agents re-plan. Each button starts a fresh deliberation.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className={button}
          disabled={running || !top}
          onClick={() =>
            top && void act(() => client.setSoldOut(top.drink_id), `${top.drink_name} just sold out.`)
          }
        >
          #1 sells out
        </button>
        <button
          type="button"
          className={button}
          disabled={running || !topShop}
          onClick={() =>
            void act(() => client.shopOffline(topShop), `${shopLabel(topShop)}'s agent went offline.`)
          }
        >
          #1's shop goes offline
        </button>
        <button
          type="button"
          className={button}
          disabled={running}
          onClick={() => void act(() => client.shopJoin("lantern_leaf"), "Lantern Leaf just joined TeaLink.")}
        >
          Lantern Leaf joins
        </button>
        <button
          type="button"
          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream disabled:opacity-40"
          disabled={running}
          onClick={() =>
            void act(
              () => client.setPreference(getSession().userId, { brown_sugar: 0 }),
              `${getSession().name} doesn't like brown sugar.`,
            )
          }
        >
          I don't like brown sugar
        </button>
        <button type="button" className={button} disabled={running} onClick={() => void resetAll()}>
          Reset demo
        </button>
      </div>
    </section>
  );
}
