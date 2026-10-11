"""Anonymized taste trends for one shop. Buckets under 5 people are omitted."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from tealink.core.preferences import PRIOR
from tealink.schemas import DIMENSIONS
from tealink.store.menu import drink_base

RANGES = {"week": 7, "month": 30, "year": 365}
MINIMUM = 5


def demand(runtime, shop_id: str, span: str, now: datetime | None = None) -> dict:
    if span not in RANGES:
        raise ValueError("range must be week, month, or year")
    now = now or datetime.now(UTC)
    start = now - timedelta(days=RANGES[span])
    events = _events(runtime, start, now)
    people = sorted({user_id for user_id, _drink, _when in events})
    hidden = len(people) < MINIMUM
    return {
        "range": span,
        "people": len(people),
        "bases": [] if hidden else _bases(runtime, events),
        "flavors": [] if hidden else _flavors(runtime, events),
        "top_drinks": [] if hidden else _top(runtime, events, shop_id=None),
        "own_top_drinks": [] if hidden else _top(runtime, events, shop_id=shop_id),
        "priorities": _priorities(runtime, people) if not hidden else {dim: 0.25 for dim in DIMENSIONS},
    }


def _events(runtime, start: datetime, now: datetime) -> list[tuple[str, str, datetime]]:
    found: list[tuple[str, str, datetime]] = []
    for item in runtime.social.feed.values():
        if item.kind not in ("review", "pick") or not item.drink_id:
            continue
        moment = _parse(item.created_at)
        if start <= moment <= now:
            found.append((item.user_id, item.drink_id, moment))
    for order in runtime.orders:
        if order["status"] == "cancelled":
            continue
        moment = _parse(order["created_at"])
        if not (start <= moment <= now):
            continue
        for line in order["items"]:
            found.append((order["user_id"], line["drink_id"], moment))
    return found


def _bases(runtime, events: list[tuple[str, str, datetime]]) -> list[dict]:
    people: dict[str, set[str]] = {"milk": set(), "fruit": set(), "tea": set()}
    for user_id, drink_id, _when in events:
        drink = runtime.catalog.drink(drink_id)
        if drink is None:
            continue
        people[drink_base(drink)].add(user_id)
    total = len({user_id for user_id, _drink, _when in events}) or 1
    return [
        {"base": base, "share": round(len(who) / total, 4)}
        for base, who in people.items()
        if len(who) >= MINIMUM
    ]


def _flavors(runtime, events: list[tuple[str, str, datetime]]) -> list[dict]:
    people: dict[str, set[str]] = {}
    for user_id, drink_id, _when in events:
        drink = runtime.catalog.drink(drink_id)
        if drink is None:
            continue
        for tag in drink.flavor_tags:
            people.setdefault(tag, set()).add(user_id)
    total = len({user_id for user_id, _drink, _when in events}) or 1
    ranked = sorted(people.items(), key=lambda item: (-len(item[1]), item[0]))
    return [
        {"tag": tag, "share": round(len(who) / total, 4)}
        for tag, who in ranked
        if len(who) >= MINIMUM
    ]


def _top(runtime, events: list[tuple[str, str, datetime]], shop_id: str | None) -> list[dict]:
    people: dict[str, set[str]] = {}
    counts: dict[str, int] = {}
    for user_id, drink_id, _when in events:
        drink = runtime.catalog.drink(drink_id)
        if drink is None or (shop_id is not None and drink.shop_id != shop_id):
            continue
        people.setdefault(drink_id, set()).add(user_id)
        counts[drink_id] = counts.get(drink_id, 0) + 1
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return [
        {"drink_id": drink_id, "count": count}
        for drink_id, count in ranked
        if len(people[drink_id]) >= MINIMUM
    ]


def _priorities(runtime, people: list[str]) -> dict[str, float]:
    if not people:
        return {dim: 0.25 for dim in DIMENSIONS}
    from tealink.api.social import prior_weights

    totals = {dim: 0.0 for dim in DIMENSIONS}
    agent = None
    transport = runtime.transport
    agents = getattr(transport, "agents", None)
    if agents is None:
        agents = getattr(getattr(transport, "fallback", None), "agents", None)
    if agents:
        agent = agents.get("preference")
    for user_id in people:
        weights = agent.weights(user_id, prior_weights(runtime, user_id)) if agent is not None else dict(PRIOR)
        for dim in DIMENSIONS:
            totals[dim] += weights.get(dim, 0.0)
    scale = len(people)
    return {dim: round(totals[dim] / scale, 4) for dim in DIMENSIONS}


def _parse(stamp: str) -> datetime:
    moment = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(UTC)
