import { useState } from "react";
import { Link } from "react-router-dom";
import { useStorePreview } from "../api/http.ts";
import { orders as ordersApi } from "../api/orders.ts";
import type { Order } from "../api/types.ts";
import { OrderCard } from "../components/OrderCard.tsx";
import { shopLabel } from "../lib/format.ts";
import { useOrders } from "../state/orders.ts";

function Rate({ order, onDone }: { order: Order; onDone: () => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || order.rating || 0;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-sage px-4 py-2.5">
      <span className="text-sm">{order.rating ? "Your rating" : `How was the ${order.items[0]?.name ?? "drink"}?`}</span>
      <div className="flex" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(star)}
            onClick={() => void ordersApi.rate(order.order_id, star).then(onDone)}
            className={`px-0.5 text-xl leading-none ${star <= shown ? "text-moss" : "text-ink/25"}`}
          >
            ★
          </button>
        ))}
      </div>
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
          Pickup orders and where they are. The shop moves them along.
          {preview ? " Orders live in this browser until the API serves them." : ""}
        </p>
      </header>
      {error ? <p className="rounded-3xl border border-line bg-foam p-5">{error}</p> : null}
      {cancelError ? <p className="text-sm text-[#a33]">{cancelError}</p> : null}
      {orders === null ? (
        <p className="text-mute">Loading orders…</p>
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
