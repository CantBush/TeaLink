import type { Offer } from "../api/types.ts";

export const PICKUP_FEE = 0.5;

const cents = (value: number) => Math.round(value * 100) / 100;

export interface Quote {
  subtotal: number;
  discount: number;
  pickup_fee: number;
  total: number;
}

/**
 * The price the customer sees at checkout. The close-call offer only discounts the drink it was shown
 * for, and never the toppings. The server computes the real total; this mirrors it.
 */
export function quote(drinkPrice: number, toppings: number, offer: Offer | null | undefined): Quote {
  const subtotal = cents(drinkPrice + toppings);
  const discount = offer ? Math.max(0, cents(drinkPrice - offer.price_after)) : 0;
  return { subtotal, discount, pickup_fee: PICKUP_FEE, total: cents(subtotal - discount + PICKUP_FEE) };
}

export const STATUS_STEPS = ["placed", "accepted", "ready", "picked_up"] as const;

export const STATUS_LABEL = {
  placed: "placed",
  accepted: "making it",
  ready: "ready for pickup",
  picked_up: "picked up",
  cancelled: "cancelled",
} as const;
