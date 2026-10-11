import { useState } from "react";
import { useStorePreview } from "../../api/http.ts";
import { orders as ordersApi } from "../../api/orders.ts";
import type { Order, OrderStatus } from "../../api/types.ts";
import { OrderCard } from "../../components/OrderCard.tsx";
import { useOrders } from "../../state/orders.ts";
import { ShopPage } from "./ShopLayout.tsx";
import { Loading } from "../../components/Loading.tsx";

const ADVANCE: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  placed: { to: "accepted", label: "Accept" },
  accepted: { to: "ready", label: "Mark ready" },
  ready: { to: "picked_up", label: "Picked up" },
};

const OPEN: OrderStatus[] = ["placed", "accepted", "ready"];

/** Incoming pickup orders, oldest first, and the button that moves each one along. */
export function ShopOrders() {
  const { orders, error, refresh } = useOrders();
  const preview = useStorePreview();
  const [actionError, setActionError] = useState<string | null>(null);

  const move = (order: Order, status: OrderStatus) => {
    setActionError(null);
    ordersApi
      .setStatus(order.order_id, status)
      .then(refresh)
      .catch((reason: unknown) => setActionError(reason instanceof Error ? reason.message : "Couldn't update the order."));
  };

  const open = (orders ?? []).filter((order) => OPEN.includes(order.status)).reverse();
  const done = (orders ?? []).filter((order) => !OPEN.includes(order.status)).slice(0, 10);
  const who = (order: Order) => `for ${order.customer_name || order.user_id}`;

  return (
    <ShopPage>
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-moss">orders</p>
        <h1 className="mt-1 font-display text-4xl">incoming</h1>
        <p className="mt-2 text-mute">
          Pickup orders from TeaLink. Accept, mark ready, then hand it over.
          {preview ? " Orders live in this browser until the API serves them." : ""}
        </p>
      </header>
      {error ? <p className="rounded-3xl border border-line bg-foam p-5">{error}</p> : null}
      {actionError ? <p className="text-sm text-[#a33]">{actionError}</p> : null}
      {orders === null ? (
        <Loading label="Loading orders…" />
      ) : open.length === 0 ? (
        <p className="rounded-[28px] border border-line bg-foam p-6 text-center text-mute">No open orders right now.</p>
      ) : (
        <ul className="space-y-3">
          {open.map((order) => {
            const next = ADVANCE[order.status];
            return (
              <OrderCard key={order.order_id} order={order} who={who(order)}>
                <div className="flex gap-2">
                  {next ? (
                    <button type="button" onClick={() => move(order, next.to)} className="flex-1 rounded-full bg-ink py-2.5 font-semibold text-foam">
                      {next.label}
                    </button>
                  ) : null}
                  {order.status !== "ready" ? (
                    <button type="button" onClick={() => move(order, "cancelled")} className="rounded-full border border-line px-4 py-2.5 text-sm font-semibold">
                      Cancel
                    </button>
                  ) : null}
                </div>
              </OrderCard>
            );
          })}
        </ul>
      )}
      {done.length ? (
        <section>
          <h2 className="mb-3 font-display text-2xl">done</h2>
          <ul className="space-y-3">
            {done.map((order) => (
              <OrderCard key={order.order_id} order={order} who={who(order)} />
            ))}
          </ul>
        </section>
      ) : null}
    </ShopPage>
  );
}
