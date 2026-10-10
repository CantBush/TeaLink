import { useNavigate } from "react-router-dom";
import { client } from "../api/client.ts";
import { pushStatus } from "../state/session.ts";

export function ControlPanel({
  drinkId,
  drinkName,
}: {
  drinkId: string;
  drinkName: string;
}) {
  const navigate = useNavigate();

  return (
    <section className="rounded-[28px] border border-line bg-foam p-5 sm:p-6">
      <h2 className="font-display text-2xl">What if</h2>
      <p className="mt-1 text-sm text-mute">
        Nudge the counter. If the shop API is quiet, the timeline still moves.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-full border border-ink/15 bg-cream px-4 py-2 text-sm font-semibold"
          onClick={() => {
            void client.setSoldOut(drinkId).catch(() => {});
            pushStatus(`${drinkName} was marked sold out at the shop.`);
          }}
        >
          Shop sold out
        </button>
        <button
          type="button"
          className="rounded-full border border-ink/15 bg-cream px-4 py-2 text-sm font-semibold"
          onClick={() => {
            pushStatus("Lantern Leaf joined the counter.");
          }}
        >
          New shop joins
        </button>
        <button
          type="button"
          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream"
          onClick={() => {
            void client
              .setPreference("andrew", { brown_sugar: 0 })
              .catch(() => {});
            pushStatus("Andrew turned brown sugar down to zero.");
            navigate("/counterfactual");
          }}
        >
          I don't like brown sugar
        </button>
      </div>
    </section>
  );
}
