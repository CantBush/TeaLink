"""Apply structured what-if changes, and turn typed text into those changes.

The keyword matcher is the no-LLM fallback. It only emits known kinds with real
ids. Scores stay in the teagents; this module never ranks a drink.
"""

from __future__ import annotations

import re
from tealink.agents.scoring import user_profile
from tealink.schemas import ATTRIBUTES

TASTE_STEP = 0.3
GENERIC = {"tea", "milk", "the", "with", "and", "of"}
TASTE_PATTERNS = (
    (re.compile(r"\bsweeter\b|\bmore sweet"), "sweetness", "more"),
    (re.compile(r"\b(less|not as|not too|less of a) sweet"), "sweetness", "less"),
    (re.compile(r"\bmilkier\b|\bmore milk"), "milkiness", "more"),
    (re.compile(r"\b(less|not as) milk"), "milkiness", "less"),
    (re.compile(r"\b(more|stronger) tea\b|\btea-forward\b|\bstronger\b"), "tea_intensity", "more"),
    (re.compile(r"\b(less|lighter|weaker) tea\b"), "tea_intensity", "less"),
    (re.compile(r"\bfruitier\b|\bmore fruit"), "fruitiness", "more"),
    (re.compile(r"\b(less|not as) fruit"), "fruitiness", "less"),
    (re.compile(r"\bmore toppings?\b"), "toppings", "more"),
    (re.compile(r"\b(fewer|less|no) toppings?\b"), "toppings", "less"),
)


async def apply_changes(runtime, user_id: str, changes: list[dict]) -> list[dict]:
    """Mutate the live session. Reset demo rebuilds the runtime and clears this."""
    from tealink.api.main import ShopEvent, shop_join, shop_offline

    applied: list[dict] = []
    overrides = dict(runtime.preferences.get(user_id, {}))
    profile = user_profile(runtime.catalog, user_id)
    for change in changes:
        kind = change.get("kind")
        if kind == "sold_out":
            _require_drink(runtime, change["drink_id"])
            runtime.sold_out.add(change["drink_id"])
        elif kind == "restock":
            drink = _require_drink(runtime, change["drink_id"])
            runtime.sold_out.discard(change["drink_id"])
            drink.available = True
        elif kind == "shop_offline":
            _require_shop(runtime, change["shop_id"])
            await shop_offline(ShopEvent(shop_id=change["shop_id"]))
        elif kind in ("shop_online", "shop_join"):
            await shop_join(ShopEvent(shop_id=change["shop_id"]))
        elif kind == "avoid":
            tag = str(change.get("tag") or "")
            if tag not in _flavors(runtime):
                raise KeyError(tag)
            overrides[tag] = 0
        elif kind == "taste":
            attribute = change.get("attribute")
            if attribute not in ATTRIBUTES:
                raise ValueError("unknown taste")
            step = TASTE_STEP if change.get("direction") == "more" else -TASTE_STEP
            overrides[attribute] = min(1.0, max(0.0, float(profile.get(attribute, 0.5)) + step))
        elif kind == "max_price":
            dollars = float(change["dollars"])
            if dollars < 0:
                raise ValueError("price limit cannot be negative")
            runtime.max_price[user_id] = dollars
        elif kind == "price":
            drink = _require_drink(runtime, change["drink_id"])
            dollars = float(change["dollars"])
            if dollars < 0:
                raise ValueError("price cannot be negative")
            drink.price = dollars
        else:
            raise ValueError("unknown change")
        applied.append(change)
    if overrides:
        runtime.preferences[user_id] = overrides
    return applied


def parse_text(runtime, text: str) -> dict:
    changes: list[dict] = []
    not_understood: list[str] = []
    flavors = _flavors(runtime)
    shops = _shop_keys(runtime)
    clauses = [
        part.strip()
        for part in re.split(r"[,;.\n]|\band\b|\bbut\b", text.lower().replace("’", "'").replace("'", "'"))
        if part.strip()
    ]
    for clause in clauses:
        found = _clause(runtime, clause, flavors, shops)
        if found:
            for change in found:
                if change not in changes:
                    changes.append(change)
        else:
            not_understood.append(clause)
    return {"changes": changes, "not_understood": not_understood}


def _clause(runtime, clause: str, flavors: list[str], shops: list[tuple[str, str]]) -> list[dict]:
    found: list[dict] = []
    shop_id = next((shop for shop, key in shops if key and key in clause), None)
    amount = _dollars(clause)
    if amount is not None and re.search(r"\b(under|below|less than|max|at most|no more than|budget)\b", clause):
        found.append({"kind": "max_price", "dollars": amount})
    for pattern, attribute, direction in TASTE_PATTERNS:
        if pattern.search(clause):
            found.append({"kind": "taste", "attribute": attribute, "direction": direction})
    avoid = re.search(r"\b(?:no|don't like|do not like|without|hate|avoid|not into|allergic to|skip)\s+(.+)", clause)
    if avoid:
        tail = avoid.group(1)
        tag = next((item for item in flavors if _label(item) in tail or item.replace("_", " ") in tail), None)
        if tag:
            found.append({"kind": "avoid", "tag": tag})
    drink_id = _find_drink(runtime, clause, shop_id)
    if drink_id and re.search(r"\bsold out\b|\bout of stock\b|\bran out\b|\bunavailable\b", clause):
        found.append({"kind": "sold_out", "drink_id": drink_id})
    elif drink_id and re.search(r"\bback in stock\b|\brestock|\bback\b|\bavailable again\b", clause):
        found.append({"kind": "restock", "drink_id": drink_id})
    elif (
        drink_id
        and amount is not None
        and re.search(r"\b(costs?|now|price|is)\b", clause)
        and not any(item["kind"] == "max_price" for item in found)
    ):
        found.append({"kind": "price", "drink_id": drink_id, "dollars": amount})
    elif shop_id and not found:
        if re.search(r"\boffline\b|\bclosed?\b|\bdown\b", clause):
            found.append({"kind": "shop_offline", "shop_id": shop_id})
        elif re.search(r"\bjoins?\b|\bjoined\b|\bnew\b", clause):
            found.append({"kind": "shop_join", "shop_id": shop_id})
        elif re.search(r"\bonline\b|\bopen\b|\bback\b", clause):
            found.append({"kind": "shop_online", "shop_id": shop_id})
    return found


def _find_drink(runtime, clause: str, shop_id: str | None) -> str | None:
    best: tuple[float, str] | None = None
    for drink in runtime.catalog.drinks:
        if shop_id and drink.shop_id != shop_id:
            continue
        words = [word for word in re.split(r"\s+", drink.name.lower()) if word and word not in GENERIC]
        hits = sum(1 for word in words if re.search(rf"\b{re.escape(word)}\b", clause))
        score = hits / max(len(words), 1) + (1 if drink.name.lower() in clause else 0)
        if hits > 0 and (best is None or score > best[0]):
            best = (score, drink.id)
    return best[1] if best else None


def _dollars(clause: str) -> float | None:
    match = re.search(r"\$\s?(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s?(?:dollars|bucks)", clause)
    if not match:
        return None
    return float(match.group(1) or match.group(2))


def _shop_keys(runtime) -> list[tuple[str, str]]:
    keys = []
    for shop in runtime.catalog.shops:
        key = re.sub(r"\b(tea|co\.?|studio|lab|lounge)\b", "", shop.name.lower())
        key = re.sub(r"\s+", " ", key).strip()
        keys.append((shop.id, key))
    return keys


def _flavors(runtime) -> list[str]:
    tags = {tag for drink in runtime.catalog.drinks for tag in drink.flavor_tags}
    return sorted(tags)


def _label(tag: str) -> str:
    return tag.replace("_", " ")


def _require_drink(runtime, drink_id: str):
    drink = runtime.catalog.drink(drink_id)
    if drink is None:
        raise KeyError(drink_id)
    return drink


def _require_shop(runtime, shop_id: str):
    shop = runtime.catalog.shop(shop_id)
    if shop is None:
        raise KeyError(shop_id)
    return shop
