"""Pickup orders. Placing an order for a top-3 drink is the pick the Preference teagent learns from.

Card checkout uses Stripe test mode when STRIPE_SECRET_KEY is set. Otherwise
the order is pay at pickup, which is what the demo uses.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from uuid import uuid4

from tealink.core.taste import order_evidence_weight
from tealink.schemas import Review
from tealink.store.menu import drink_view

PICKUP_FEE = 0.5
NEXT = {
    "placed": {"accepted", "cancelled"},
    "accepted": {"ready", "cancelled"},
    "ready": {"picked_up"},
    "picked_up": set(),
    "cancelled": set(),
}


def cents(value: float) -> float:
    return round(value * 100) / 100


def create_order(runtime, account: dict, body: dict) -> dict:
    if account["role"] != "customer":
        raise PermissionError("sign in as a customer to order")
    shop_id = body["shop_id"]
    if runtime.catalog.shop(shop_id) is None:
        raise KeyError("shop")
    items_in = body.get("items") or []
    if not items_in:
        raise ValueError("an order needs a drink")
    decision = runtime.last_decision.get(account["user_id"])
    subtotal = 0.0
    discount = 0.0
    items = []
    for raw in items_in:
        drink = runtime.catalog.drink(raw["drink_id"])
        if drink is None or drink.shop_id != shop_id:
            raise KeyError(raw["drink_id"])
        view = drink_view(runtime, drink)
        if not view["available"]:
            raise ValueError(f"{drink.name} just sold out.")
        extras = 0.0
        toppings = list(raw.get("toppings") or [])
        menu_toppings = {item["name"]: float(item["price"]) for item in view["options"].get("toppings", [])}
        for name in toppings:
            extras += menu_toppings.get(name, 0.0)
        line_discount = _line_discount(decision, drink.id, drink.price)
        line_subtotal = cents(drink.price + extras)
        subtotal += line_subtotal
        discount += line_discount
        items.append(
            {
                "drink_id": drink.id,
                "name": drink.name,
                "price": line_subtotal,
                "sugar": raw.get("sugar"),
                "ice": raw.get("ice"),
                "toppings": toppings,
            }
        )
    discount = cents(discount)
    total = cents(subtotal - discount + PICKUP_FEE)
    pay = body.get("pay") or "pickup"
    payment_url = None
    if pay == "card":
        payment_url = _stripe_url(total)
        if payment_url is None:
            pay = "pickup"
    user = runtime.catalog.users_by_id.get(account["user_id"])
    name = user.name if user else account["user_id"]
    try:
        name = runtime.social.profile(account["user_id"]).display_name or name
    except Exception:
        pass
    order = {
        "order_id": uuid4().hex[:8],
        "user_id": account["user_id"],
        "customer_name": name,
        "shop_id": shop_id,
        "items": items,
        "subtotal": cents(subtotal),
        "discount": discount,
        "pickup_fee": PICKUP_FEE,
        "total": total,
        "pay": pay,
        "status": "placed",
        "created_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rating": None,
        "payment_url": payment_url,
    }
    runtime.orders.insert(0, order)
    return order


def list_orders(runtime, account: dict) -> list[dict]:
    if account["role"] == "store":
        return [_public(order) for order in runtime.orders if order["shop_id"] == account.get("shop_id")]
    return [_public(order) for order in runtime.orders if order["user_id"] == account["user_id"]]


def update_order(runtime, account: dict, order_id: str, patch: dict) -> dict:
    order = next((item for item in runtime.orders if item["order_id"] == order_id), None)
    if order is None:
        raise KeyError(order_id)
    if "status" in patch and patch["status"] is not None:
        status = patch["status"]
        if status not in NEXT.get(order["status"], set()):
            raise ValueError(f"A {order['status'].replace('_', ' ')} order can't become {status.replace('_', ' ')}.")
        if account["role"] == "store":
            if account.get("shop_id") != order["shop_id"]:
                raise PermissionError("that order is for another shop")
        elif status != "cancelled" or order["user_id"] != account["user_id"]:
            raise PermissionError("only the shop can move this order along")
        order["status"] = status
    if "rating" in patch:
        if account["user_id"] != order["user_id"]:
            raise PermissionError("only you can rate your order")
        if order["status"] != "picked_up":
            raise ValueError("rate the drink after you pick it up")
        if patch["rating"] is None:
            order["rating"] = None
        else:
            rating = int(patch["rating"])
            if not 0 <= rating <= 5:
                raise ValueError("rating must be from 0 to 5")
            order["rating"] = rating
        sync_order_review(runtime, order)
    return _public(order)


def sync_order_review(runtime, order: dict) -> None:
    """The taste signal for this order. An unrated order counts as it does today.

    A top-3 order does not add a review until it is rated. Anything else is a
    4/5 until a rating replaces it. 0 and 1 push away from the drink. Reset
    demo drops the order and the review with the rest of the runtime.
    """
    review_id = f"order_{order['order_id']}"
    if order.get("rating") is None and order.get("in_top"):
        runtime.catalog.drop_review(review_id)
        return
    stored = 4 if order.get("rating") is None else int(order["rating"])
    runtime.catalog.upsert_review(
        Review(
            id=review_id,
            user_id=order["user_id"],
            drink_id=order["items"][0]["drink_id"],
            rating=stored,
            text="Ordered this.",
            evidence_weight=None if order.get("rating") is None else order_evidence_weight(stored),
        )
    )


def _line_discount(decision, drink_id: str, price: float) -> float:
    if decision is None:
        return 0.0
    for option in decision.options:
        if option.drink_id == drink_id and option.offer is not None:
            return max(0.0, cents(price - option.offer.price_after))
    return 0.0


def _public(order: dict) -> dict:
    hidden = {"payment_url", "in_top"}
    return {key: value for key, value in order.items() if key not in hidden}


def receipt(order: dict, learned: dict | None = None) -> dict:
    body = {
        "order_id": order["order_id"],
        "total": order["total"],
        "status": "placed",
        "payment_url": order.get("payment_url"),
    }
    if learned is not None:
        body["learned"] = learned
    return body


def history(runtime, user_id: str) -> list[dict]:
    """Newest 10 past orders: seeded picks plus orders placed in the app. No prices.

    Placed, accepted, ready, and picked up all count. A cancelled order drops
    out. ``rating`` is null until the customer rates it after pickup. The
    profile route strips ``rating`` for anyone who is not this user.
    """
    rows: list[dict] = []
    for item in runtime.social.feed.values():
        if item.user_id != user_id or item.kind != "pick" or not item.drink_id:
            continue
        if not str(item.id).startswith("f_pick_"):
            continue
        drink = runtime.catalog.drink(item.drink_id)
        if drink is None:
            continue
        rows.append(
            {"drink_id": item.drink_id, "shop_id": drink.shop_id, "ordered_at": item.created_at, "rating": None}
        )
    for order in runtime.orders:
        if order["user_id"] != user_id or order["status"] == "cancelled":
            continue
        for line in order["items"]:
            rows.append(
                {
                    "drink_id": line["drink_id"],
                    "shop_id": order["shop_id"],
                    "ordered_at": order["created_at"],
                    "rating": order.get("rating"),
                }
            )
    rows.sort(key=lambda row: row["ordered_at"], reverse=True)
    return rows[:10]


def _stripe_url(total: float) -> str | None:
    key = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    if not key:
        return None
    body = urllib.parse.urlencode(
        {
            "mode": "payment",
            "success_url": "http://localhost:5173/orders",
            "cancel_url": "http://localhost:5173/orders",
            "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": "usd",
            "line_items[0][price_data][unit_amount]": str(int(round(total * 100))),
            "line_items[0][price_data][product_data][name]": "TeaLink pickup",
        }
    ).encode()
    request = urllib.request.Request(
        "https://api.stripe.com/v1/checkout/sessions",
        data=body,
        headers={"Authorization": f"Bearer {key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            payload = json.loads(response.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None
    url = payload.get("url")
    return url if isinstance(url, str) else None
