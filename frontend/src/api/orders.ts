import { orderMock } from "../mocks/orderStore.ts";
import { getMe } from "../state/me.ts";
import { getRole, getShopId } from "../state/role.ts";
import { getSession } from "../state/session.ts";
import { request, withFallback } from "./http.ts";
import type { Offer, Order, OrderReceipt, OrderRequest, OrderStatus } from "./types.ts";

/** Pickup orders. Live routes first; the mock keeps them in this browser. */
export const orders = {
  /** The API reads the customer from the session and validates the offer itself. */
  create: (body: OrderRequest, offer: { drink_id: string; offer: Offer } | null) =>
    withFallback(
      () => request<OrderReceipt>("POST", "/orders", body),
      (): OrderReceipt => {
        const order = orderMock.create({ user_id: getMe(), name: getSession().name || getMe() }, body, offer);
        return { order_id: order.order_id, total: order.total, status: "placed", payment_url: null };
      },
    ),

  /** Yours as a customer, the shop's incoming ones as a store. */
  list: () =>
    withFallback(
      () => request<Order[]>("GET", "/orders"),
      () => orderMock.list(getRole() === "store" ? { shop_id: getShopId() ?? "" } : { user_id: getMe() }),
    ),

  setStatus: (orderId: string, status: OrderStatus) =>
    withFallback(
      () => request<Order>("PATCH", `/orders/${encodeURIComponent(orderId)}`, { status }),
      () => orderMock.setStatus(orderId, status),
    ),

  rate: (orderId: string, rating: number) =>
    withFallback(
      () => request<Order>("PATCH", `/orders/${encodeURIComponent(orderId)}`, { rating }),
      () => orderMock.rate(orderId, rating),
    ),
};
