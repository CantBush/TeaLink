import { useState } from "react";
import { Link } from "react-router-dom";
import { useStorePreview } from "../api/http.ts";
import { orders as ordersApi } from "../api/orders.ts";
import type { Order } from "../api/types.ts";
import { OrderCard } from "../components/OrderCard.tsx";
import { shopLabel } from "../lib/format.ts";
import { useOrders } from "../state/orders.ts";
import { rerun } from "../state/session.ts";
import { profilesChanged } from "../state/social.ts";
import { Loading } from "../components/Loading.tsx";

/** 0–5 after pickup. The teagents weigh it on the next round, and your taste profile learns from it. */
function Rate({ order, onDone }: { order: Order; onDone: () => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rated = order.rating ?? null;
  const shown = hover ?? rated ?? -1;
  const name = order.items[0]?.name ?? "drink";

  const rate = (rating: number | null) => {
    setBusy(true);
    setError(null);
    ordersApi
      .rate(order.order_id, rating)
      .then(() => {
        onDone();
        profilesChanged();
        rerun(rating === null ? `You cleared your rating for ${name}.` : `You rated ${name} ${rating}/5.`);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Couldn't save your rating."))
      .finally(() => setBusy(false));
  };

  return (
    <div className="rounded-2xl bg-sage px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm">{rated !== null ? `You gave it ${rated}/5` : `How was the ${name}?`}</span>
        <div className="flex items-center" onMouseLeave={() => setHover(null)}>
          <button
            type="button"
            disabled={busy}
            aria-label="0 stars"
            aria-pressed={rated === 0}
            onMouseEnter={() => setHover(0)}
            onClick={() => rate(0)}
            className={`mr-1 min-h-9 rounded-full px-2 text-xs font-semibold ${shown === 0 ? "bg-ink text-foam" : "text-ink/40"}`}
          >
            0
          </button>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              disabled={busy}
              aria-label={`${star} star${star > 1 ? "s" : ""}`}
              aria-pressed={rated === star}
              onMouseEnter={() => setHover(star)}
              onClick={() => rate(star)}
              className={`px-0.5 text-xl leading-none ${star <= shown ? "text-moss" : "text-ink/25"}`}
            >
              ★
            </button>
          ))}
        </div>
        {rated !== null ? (
          <button type="button" disabled={busy} onClick={() => rate(null)} className="text-xs font-semibold text-mute hover:text-ink">
            Clear
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-xs font-semibold text-[#b4533c]">{error}</p> : null}
    </div>
  );
}

/** Your pickup orders and where each one is. */
export function Orders() {
  const { orders, error, refresh } = useOrders();
  const preview = useStorePreview();
  const [cancelError, setCancelError] = useState<string | null>(null);

  const cancel = (order: Order) => {
    setCancelError(null);
    ordersApi
      .setStatus(order.order_id, "cancelled")
      .then(refresh)
      .catch((reason: unknown) => setCancelError(reason instanceof Error ? reason.message : "Couldn't cancel."));
  };

  return (
    <main className="mx-auto max-w-xl space-y-6 px-5 py-6 sm:py-8">
      <header>
        <h1 className="font-display text-4xl">your orders</h1>
        <p className="mt-2 text-mute">
          Pickup orders and where they are. The shop moves them along. Rate a drink after pickup and your teagents take it into account.
          {preview ? " Orders live in this browser until the API serves them." : ""}
        </p>
      </header>
      {error ? <p className="rounded-3xl border border-line bg-foam p-5">{error}</p> : null}
      {cancelError ? <p className="text-sm text-[#a33]">{cancelError}</p> : null}
      {orders === null ? (
        <Loading label="Loading your orders…" />
      ) : orders.length === 0 ? (
        <div className="rounded-[28px] border border-line bg-foam p-6 text-center">
          <p className="font-display text-2xl">no orders yet</p>
          <p className="mt-1 text-mute">Order for pickup from your top 3 or any drink in Discover.</p>
          <Link to="/" className="mt-4 inline-block rounded-full bg-ink px-5 py-2.5 font-semibold text-foam">
            See your top 3
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <OrderCard key={order.order_id} order={order} who={shopLabel(order.shop_id)}>
              {order.status === "placed" ? (
                <button type="button" onClick={() => cancel(order)} className="text-sm font-semibold text-mute underline-offset-4 hover:underline">
                  Cancel order
                </button>
              ) : null}
              {order.status === "ready" ? <p className="text-sm font-semibold text-moss">Ready at the counter.</p> : null}
              {order.status === "picked_up" ? <Rate order={order} onDone={refresh} /> : null}
            </OrderCard>
          ))}
        </ul>
      )}
    </main>
  );
}
