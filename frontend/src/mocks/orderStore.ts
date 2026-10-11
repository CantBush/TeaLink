import type { Offer, Order, OrderRequest, OrderStatus } from "../api/types.ts";
import { quote } from "../lib/order.ts";
import { shopMock } from "./shopStore.ts";

/** Orders in this browser until Track A serves /orders. Customer and shop share them, so one laptop can demo both. */

const KEY = "tealink.mock_orders";

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  placed: ["accepted", "cancelled"],
  accepted: ["ready", "cancelled"],
  ready: ["picked_up"],
  picked_up: [],
  cancelled: [],
};

function read(): Order[] {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? "[]") as Order[]) ?? [];
  } catch {
    return [];
  }
}

function write(orders: Order[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(orders));
  } catch {
    /* Storage blocked: the order is lost on reload. */
  }
}

function update(orderId: string, change: (order: Order) => Order): Order {
  const orders = read();
  const index = orders.findIndex((order) => order.order_id === orderId);
  if (index < 0) throw new Error("That order no longer exists.");
  orders[index] = change(orders[index]);
  write(orders);
  return orders[index];
}

export const orderMock = {
  /** `offer` is the close-call offer still on screen for that drink; anything else pays full price. */
  create(customer: { user_id: string; name: string }, request: OrderRequest, offer: { drink_id: string; offer: Offer } | null): Order {
    const menu = shopMock.menu(request.shop_id).drinks;
    let subtotal = 0;
    let discount = 0;
    const items = request.items.map((item) => {
      const drink = menu.find((entry) => entry.id === item.drink_id);
      if (!drink) throw new Error("That drink isn't on the menu anymore.");
      if (!drink.available) throw new Error(`${drink.name} just sold out.`);
      const extras = (item.toppings ?? []).reduce(
        (sum, name) => sum + (drink.options?.toppings.find((topping) => topping.name === name)?.price ?? 0),
        0,
      );
      const priced = quote(drink.price, extras, offer?.drink_id === drink.id ? offer.offer : null);
      subtotal += priced.subtotal;
      discount += priced.discount;
      return { ...item, name: drink.name, price: priced.subtotal };
    });
    const totals = quote(subtotal, 0, null);
    const order: Order = {
      order_id: crypto.randomUUID().slice(0, 8),
      user_id: customer.user_id,
      customer_name: customer.name,
      shop_id: request.shop_id,
      items,
      subtotal: totals.subtotal,
      discount: Math.round(discount * 100) / 100,
      pickup_fee: totals.pickup_fee,
      total: Math.round((totals.total - discount) * 100) / 100,
      pay: "pickup",
      status: "placed",
      created_at: new Date().toISOString(),
    };
    write([order, ...read()]);
    return order;
  },

  list(filter: { user_id: string } | { shop_id: string }): Order[] {
    return read().filter((order) =>
      "user_id" in filter ? order.user_id === filter.user_id : order.shop_id === filter.shop_id,
    );
  },

  setStatus(orderId: string, status: OrderStatus): Order {
    return update(orderId, (order) => {
      if (!NEXT[order.status].includes(status)) throw new Error(`A ${order.status.replace("_", " ")} order can't become ${status.replace("_", " ")}.`);
      return { ...order, status };
    });
  },

  rate(orderId: string, rating: number | null): Order {
    return update(orderId, (order) => ({ ...order, rating }));
  },

  reset() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing stored */
    }
  },
};
