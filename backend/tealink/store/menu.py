"""Shop menus: sections, drink edits, and the shop's picture and description.

Sold-out and restock update the catalog drink and the recommender's sold-out set,
so the next deliberation sees them.
"""

from __future__ import annotations

import re
from typing import Any

from tealink.schemas import ATTRIBUTES, Drink

DEFAULT_OPTIONS = {
    "sugar": ["0%", "25%", "50%", "75%", "100%"],
    "ice": ["no ice", "less ice", "regular ice"],
    "toppings": [
        {"name": "pearls", "price": 0.75},
        {"name": "grass jelly", "price": 0.75},
        {"name": "cheese foam", "price": 1},
    ],
}

BASE_SECTION = {"milk": "milk teas", "fruit": "fruit teas", "tea": "tea-forward"}


def drink_base(drink: Drink) -> str:
    milk = drink.attributes.get("milkiness", 0.0)
    fruit = drink.attributes.get("fruitiness", 0.0)
    tea = drink.attributes.get("tea_intensity", 0.0)
    if milk >= fruit and milk >= tea:
        return "milk"
    if fruit >= tea:
        return "fruit"
    return "tea"


def _meta(runtime, drink_id: str) -> dict:
    return runtime.drink_meta.setdefault(drink_id, {})


def drink_view(runtime, drink: Drink) -> dict:
    extra = runtime.drink_meta.get(drink.id, {})
    return {
        "id": drink.id,
        "shop_id": drink.shop_id,
        "name": drink.name,
        "price": drink.price,
        "description": extra.get("description", ""),
        "photo_url": extra.get("photo_url"),
        "flavor_tags": list(drink.flavor_tags),
        "attributes": dict(drink.attributes),
        "options": extra.get("options") or DEFAULT_OPTIONS,
        "available": drink.available and drink.id not in runtime.sold_out,
    }


def shop_drinks(runtime, shop_id: str) -> list[Drink]:
    return [drink for drink in runtime.catalog.drinks if drink.shop_id == shop_id]


def default_sections(runtime, shop_id: str) -> list[dict]:
    menu = shop_drinks(runtime, shop_id)
    sections = []
    for order, base in enumerate(("milk", "fruit", "tea")):
        ids = [drink.id for drink in menu if drink_base(drink) == base]
        if ids:
            sections.append({"id": base, "name": BASE_SECTION[base], "order": order, "drink_ids": ids})
    return sections


def sections_for(runtime, shop_id: str) -> list[dict]:
    menu_ids = {drink.id for drink in shop_drinks(runtime, shop_id)}
    stored = runtime.menus.get(shop_id)
    if stored is None:
        sections = default_sections(runtime, shop_id)
    else:
        sections = []
        for section in stored:
            sections.append({**section, "drink_ids": [drink_id for drink_id in section["drink_ids"] if drink_id in menu_ids]})
    placed = {drink_id for section in sections for drink_id in section["drink_ids"]}
    loose = [drink.id for drink in shop_drinks(runtime, shop_id) if drink.id not in placed]
    if loose:
        if not sections:
            sections.append({"id": "menu", "name": "menu", "order": 0, "drink_ids": []})
        sections[0] = {**sections[0], "drink_ids": [*sections[0]["drink_ids"], *loose]}
    return sorted(sections, key=lambda section: (section["order"], section["id"]))


def section_ids_for_drink(runtime, shop_id: str, drink_id: str) -> set[str]:
    return {section["id"] for section in sections_for(runtime, shop_id) if drink_id in section["drink_ids"]}


def menu_payload(runtime, shop_id: str) -> dict:
    return {
        "drinks": [drink_view(runtime, drink) for drink in shop_drinks(runtime, shop_id)],
        "sections": sections_for(runtime, shop_id),
    }


def save_sections(runtime, shop_id: str, sections: list[dict]) -> list[dict]:
    menu_ids = {drink.id for drink in shop_drinks(runtime, shop_id)}
    stored = []
    for order, section in enumerate(sections):
        name = str(section.get("name") or "").strip()
        if not name:
            raise ValueError("a section needs a name")
        section_id = str(section.get("id") or "").strip() or _slug(name)
        drink_ids = [drink_id for drink_id in section.get("drink_ids") or [] if drink_id in menu_ids]
        stored.append({"id": section_id, "name": name, "order": order, "drink_ids": drink_ids})
    runtime.menus[shop_id] = stored
    return sections_for(runtime, shop_id)


def add_drink(runtime, shop_id: str, body: dict) -> dict:
    drink = Drink(
        id=_new_id(runtime, shop_id, body["name"]),
        name=body["name"].strip(),
        shop_id=shop_id,
        price=float(body["price"]),
        attributes=_attributes(body["attributes"]),
        flavor_tags=list(body.get("flavor_tags") or []),
        available=True,
    )
    if not drink.name:
        raise ValueError("a drink needs a name")
    if drink.price < 0:
        raise ValueError("price cannot be negative")
    runtime.catalog.add_drink(drink)
    extra: dict[str, Any] = {}
    if body.get("description"):
        extra["description"] = str(body["description"])
    if "photo_url" in body:
        extra["photo_url"] = body["photo_url"]
    if body.get("options"):
        extra["options"] = body["options"]
    if extra:
        runtime.drink_meta[drink.id] = extra
    return drink_view(runtime, drink)


def update_drink(runtime, shop_id: str, drink_id: str, patch: dict) -> dict:
    drink = runtime.catalog.drink(drink_id)
    if drink is None or drink.shop_id != shop_id:
        raise KeyError(drink_id)
    data = drink.model_dump()
    if "name" in patch and patch["name"] is not None:
        data["name"] = str(patch["name"]).strip() or data["name"]
    if "price" in patch and patch["price"] is not None:
        data["price"] = float(patch["price"])
        if data["price"] < 0:
            raise ValueError("price cannot be negative")
    if "flavor_tags" in patch and patch["flavor_tags"] is not None:
        data["flavor_tags"] = list(patch["flavor_tags"])
    if "attributes" in patch and patch["attributes"] is not None:
        data["attributes"] = _attributes({**data["attributes"], **patch["attributes"]})
    if "available" in patch and patch["available"] is not None:
        data["available"] = bool(patch["available"])
    updated = Drink.model_validate(data)
    runtime.catalog.replace_drink(updated)
    extra = _meta(runtime, drink_id)
    if "description" in patch:
        extra["description"] = patch["description"] or ""
    if "photo_url" in patch:
        extra["photo_url"] = patch["photo_url"]
    if "options" in patch and patch["options"] is not None:
        extra["options"] = patch["options"]
    if patch.get("available") is False:
        runtime.sold_out.add(drink_id)
    elif patch.get("available") is True:
        runtime.sold_out.discard(drink_id)
    return drink_view(runtime, updated)


def remove_drink(runtime, shop_id: str, drink_id: str) -> None:
    drink = runtime.catalog.drink(drink_id)
    if drink is None or drink.shop_id != shop_id:
        raise KeyError(drink_id)
    runtime.catalog.remove_drink(drink_id)
    runtime.drink_meta.pop(drink_id, None)
    runtime.sold_out.discard(drink_id)
    stored = runtime.menus.get(shop_id)
    if stored:
        for section in stored:
            section["drink_ids"] = [item for item in section["drink_ids"] if item != drink_id]


def set_shop_profile(runtime, shop_id: str, patch: dict) -> dict:
    profile = runtime.shop_profiles.setdefault(shop_id, {"description": "", "photo_url": None})
    if "description" in patch:
        profile["description"] = patch["description"] or ""
    if "photo_url" in patch:
        profile["photo_url"] = patch["photo_url"]
    shop = runtime.catalog.shop(shop_id)
    return {
        "id": shop_id,
        "name": shop.name if shop else shop_id,
        "description": profile["description"],
        "photo_url": profile["photo_url"],
    }


def _attributes(raw: dict) -> dict[str, float]:
    values = {}
    for key in ATTRIBUTES:
        if key not in raw:
            raise ValueError(f"attributes must include {key}")
        value = float(raw[key])
        if not 0.0 <= value <= 1.0:
            raise ValueError(f"{key} must be between 0 and 1")
        values[key] = value
    return values


def _slug(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return slug or "item"


def _new_id(runtime, shop_id: str, name: str) -> str:
    base = f"{shop_id}_{_slug(name)}"[:48]
    candidate = base
    suffix = 2
    while runtime.catalog.drink(candidate) is not None:
        candidate = f"{base}_{suffix}"
        suffix += 1
    return candidate
