"""Close-call discount rules.

Platform rules stay locked: a shop rule can shrink or block an offer, and it
cannot create one outside a close call or above the 10% / $1 cap. The offer
number is computed here, never by an LLM.
"""

from __future__ import annotations

from datetime import UTC, datetime

from tealink.schemas import Offer
from tealink.store.menu import section_ids_for_drink

PLATFORM = [
    {"id": "runner_up", "text": "Your drink is the runner-up."},
    {"id": "close", "text": "The top two scores are within 0.02."},
    {"id": "different_shops", "text": "The top two come from different shops."},
    {"id": "losing_on_price", "text": "Your drink is losing on price."},
]
CAP = {"percent": 10, "dollars": 1.0}
KINDS = {"max_discount", "drinks", "sections", "hours", "days", "daily_limit"}


def payload(runtime, shop_id: str) -> dict:
    return {"platform": PLATFORM, "rules": list(runtime.offer_rules.get(shop_id, [])), "cap": CAP}


def add_rule(runtime, shop_id: str, body: dict) -> dict:
    rule = _normalize(body, new_id=True)
    runtime.offer_rules.setdefault(shop_id, []).append(rule)
    return rule


def update_rule(runtime, shop_id: str, rule_id: str, patch: dict) -> dict:
    rules = runtime.offer_rules.get(shop_id, [])
    for index, rule in enumerate(rules):
        if rule["id"] != rule_id:
            continue
        merged = {**rule, **{key: value for key, value in patch.items() if value is not None}}
        if "value" in patch and isinstance(patch["value"], dict) and isinstance(rule.get("value"), dict):
            merged["value"] = {**rule["value"], **patch["value"]}
        updated = _normalize(merged, new_id=False)
        updated["id"] = rule_id
        rules[index] = updated
        return updated
    raise KeyError(rule_id)


def remove_rule(runtime, shop_id: str, rule_id: str) -> None:
    rules = runtime.offer_rules.get(shop_id, [])
    kept = [rule for rule in rules if rule["id"] != rule_id]
    if len(kept) == len(rules):
        raise KeyError(rule_id)
    runtime.offer_rules[shop_id] = kept


def constrain(runtime, shop_id: str, drink_id: str, offer: Offer, now: datetime | None = None) -> Offer | None:
    """Shrink or drop an offer the platform rules already allowed. Never widen it."""
    now = now or datetime.now(UTC)
    drink = runtime.catalog.drink(drink_id)
    if drink is None or drink.price <= 0:
        return None
    rules = [rule for rule in runtime.offer_rules.get(shop_id, []) if rule.get("enabled", True)]
    if not _schedule_allows(runtime, shop_id, drink_id, rules, now):
        return None
    allowed = min(drink.price - offer.price_after, drink.price * CAP["percent"] / 100, CAP["dollars"])
    for rule in rules:
        if rule["kind"] != "max_discount":
            continue
        value = rule["value"]
        allowed = min(allowed, drink.price * float(value["percent"]) / 100, float(value["dollars"]))
    if allowed <= 0.009:
        return None
    price_after = round(drink.price - allowed, 2)
    if price_after >= drink.price:
        return None
    percent = round((drink.price - price_after) / drink.price * 100)
    shop = runtime.catalog.shop(shop_id)
    shop_name = (shop.name if shop else shop_id).rstrip(".")
    runtime.offer_log.append((now.isoformat(), shop_id))
    return Offer(
        shop_id=shop_id,
        percent=percent,
        price_after=price_after,
        reason=f"{shop_name} takes {percent}% off {drink.name} (${drink.price:.2f} to ${price_after:.2f}).",
    )


def _schedule_allows(runtime, shop_id: str, drink_id: str, rules: list[dict], now: datetime) -> bool:
    for rule in rules:
        kind = rule["kind"]
        value = rule["value"]
        if kind == "drinks" and drink_id not in value.get("drink_ids", []):
            return False
        if kind == "sections":
            allowed = set(value.get("section_ids", []))
            if not section_ids_for_drink(runtime, shop_id, drink_id) & allowed:
                return False
        if kind == "hours" and not _hour_ok(now.hour, int(value["start"]), int(value["end"])):
            return False
        if kind == "days" and _sunday_index(now) not in {int(day) for day in value.get("days", [])}:
            return False
        if kind == "daily_limit" and _offers_today(runtime, shop_id, now) >= int(value["count"]):
            return False
    return True


def _hour_ok(hour: int, start: int, end: int) -> bool:
    if start == end:
        return False
    if start < end:
        return start <= hour < end
    return hour >= start or hour < end


def _sunday_index(now: datetime) -> int:
    """0 is Sunday, matching the shop rules page."""
    return (now.weekday() + 1) % 7


def _offers_today(runtime, shop_id: str, now: datetime) -> int:
    day = now.date()
    count = 0
    for stamp, logged in runtime.offer_log:
        moment = datetime.fromisoformat(stamp)
        if logged == shop_id and moment.date() == day:
            count += 1
    return count


def _normalize(body: dict, *, new_id: bool) -> dict:
    kind = body.get("kind")
    if kind not in KINDS:
        raise ValueError("unknown rule type")
    value = dict(body.get("value") or {})
    if kind == "max_discount":
        percent = min(CAP["percent"], max(0, int(value.get("percent", 0))))
        dollars = min(CAP["dollars"], max(0.0, float(value.get("dollars", 0))))
        value = {"percent": percent, "dollars": round(dollars, 2)}
    elif kind == "drinks":
        value = {"drink_ids": [str(item) for item in value.get("drink_ids") or []]}
    elif kind == "sections":
        value = {"section_ids": [str(item) for item in value.get("section_ids") or []]}
    elif kind == "hours":
        value = {"start": int(value.get("start", 0)), "end": int(value.get("end", 0))}
    elif kind == "days":
        value = {"days": sorted({int(day) for day in value.get("days") or [] if 0 <= int(day) <= 6})}
    elif kind == "daily_limit":
        value = {"count": max(0, int(value.get("count", 0)))}
    rule = {"kind": kind, "enabled": bool(body.get("enabled", True)), "value": value}
    if new_id:
        from uuid import uuid4

        rule["id"] = uuid4().hex[:8]
    return rule
