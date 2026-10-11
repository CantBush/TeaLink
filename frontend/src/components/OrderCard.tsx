import type { ReactNode } from "react";
import type { Order } from "../api/types.ts";
import { price, timeAgo } from "../lib/format.ts";
import { drinkPhoto } from "../lib/images.ts";
import { STATUS_LABEL, STATUS_STEPS } from "../lib/order.ts";

function Steps({ order }: { order: Order }) {
  if (order.status === "cancelled") return <p className="text-sm font-semibold text-mute">cancelled</p>;
  const reached = STATUS_STEPS.indexOf(order.status);
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label={`Status: ${STATUS_LABEL[order.status]}`}>
      {STATUS_STEPS.map((step, index) => (
        <li key={step}>
          <span className={`block h-1.5 rounded-full ${index <= reached ? "bg-moss" : "bg-line"}`} />
          <span className={`mt-1 block text-[11px] leading-tight ${index === reached ? "font-semibold text-ink" : "text-mute"}`}>
            {STATUS_LABEL[step]}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** One pickup order: what's in it, the total, and where it is. `who` names the other side. */
export function OrderCard({ order, who, children }: { order: Order; who: string; children?: ReactNode }) {
  return (
    <li className="space-y-3 rounded-[28px] border border-line bg-foam p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">{who}</p>
        <p className="text-xs text-mute">
          {timeAgo(order.created_at)} · #{order.order_id}
        </p>
      </div>
      <ul className="space-y-2">
        {order.items.map((item, index) => (
          <li key={index} className="flex items-center gap-3">
            {drinkPhoto(item.drink_id) ? <img src={drinkPhoto(item.drink_id)!} alt="" className="h-12 w-12 rounded-xl object-cover" /> : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-lg leading-tight">{item.name}</span>
              <span className="block truncate text-xs text-mute">
                {[item.sugar && `${item.sugar} sugar`, item.ice, ...(item.toppings ?? [])].filter(Boolean).join(" · ")}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-mute">
        {price(order.total)}
        {order.discount > 0 ? ` (saved ${price(order.discount)})` : ""} · {order.pay === "card" ? "paid by card" : "pay at pickup"}
      </p>
      <Steps order={order} />
      {children}
    </li>
  );
}