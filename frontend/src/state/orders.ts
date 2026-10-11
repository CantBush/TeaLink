import { useCallback, useEffect, useState } from "react";
import { orders } from "../api/orders.ts";
import type { Order } from "../api/types.ts";

const POLL_MS = 4000;

/** Your orders (or a shop's incoming ones), refreshed every few seconds and when another tab changes them. */
export function useOrders(): { orders: Order[] | null; error: string | null; refresh: () => void } {
  const [list, setList] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    orders
      .list()
      .then((next) => {
        setList([...next].sort((a, b) => b.created_at.localeCompare(a.created_at)));
        setError(null);
      })
      .catch(() => setError("Couldn't load orders."));
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener("storage", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return { orders: list, error, refresh };
}
