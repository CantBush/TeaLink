"""Boba stats and a boba personality, from reviews, picks, and quiz answers.

Like every number in TeaLink these are computed in code. A pick from the top
3 counts as a 4/5 for drinks the user has not reviewed, since they chose it.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, datetime

from tealink.core.taste import match_score
from tealink.data.loader import Catalog
from tealink.schemas import DIMENSIONS, BobaStats, Drink

PICK_RATING = 4
LIKED_AT = 4
TOP_N = 3
QUIZ_MATCHES = 5
EPOCH_MONDAY = date(2024, 1, 1)

FLAVOR_WORDS: dict[str, str] = {
    "brown_sugar": "Brown Sugar",
    "fruit": "Fruity",
    "jasmine": "Floral",
    "matcha": "Matcha",
    "hojicha": "Roasted",
    "taro": "Taro",
    "thai_tea": "Thai Tea",
    "oolong": "Oolong",
}
ARCHETYPES: dict[str, str] = {
    "taste": "Loyalist",
    "novelty": "Explorer",
    "cost": "Deal Hunter",
    "social": "Trendsetter",
}


def drink_toppings(drink: Drink) -> list[str]:
    """Toppings a drink comes with, read off its toppings level, tags, and name."""
    found: list[str] = []
    level = drink.attributes["toppings"]
    if level >= 0.6:
        found.append("brown sugar pearls" if "brown_sugar" in drink.flavor_tags else "boba pearls")
    elif level >= 0.4:
        found.append("boba pearls")
    name = drink.name.lower()
    if "cream" in name or "foam" in name:
        found.append("cream foam")
    return found


def rated_drinks(catalog: Catalog, user_id: str, picks: list[str]) -> list[tuple[Drink, int]]:
    """Every drink the user has tried, oldest first: reviews, then unreviewed picks."""
    rated: list[tuple[Drink, int]] = []
    seen: set[str] = set()
    for review in catalog.reviews_for(user_id):
        drink = catalog.drink(review.drink_id)
        if drink is not None and drink.id not in seen:
            rated.append((drink, review.rating))
            seen.add(drink.id)
    for drink_id in picks:
        drink = catalog.drink(drink_id)
        if drink is not None and drink.id not in seen:
            rated.append((drink, PICK_RATING))
            seen.add(drink.id)
    return rated


def top_notes(rated: list[tuple[Drink, int]]) -> list[str]:
    """Flavor tags of the drinks the user liked, weighted by how much."""
    tally: Counter[str] = Counter()
    for drink, rating in rated:
        if rating >= LIKED_AT:
            for tag in drink.flavor_tags:
                tally[tag] += rating - LIKED_AT + 1
    return [tag for tag, _count in sorted(tally.items(), key=lambda item: (-item[1], item[0]))[:TOP_N]]


def go_to_toppings(rated: list[tuple[Drink, int]]) -> list[str]:
    tally: Counter[str] = Counter()
    for drink, rating in rated:
        if rating >= LIKED_AT:
            for topping in drink_toppings(drink):
                tally[topping] += rating
    return [name for name, _count in sorted(tally.items(), key=lambda item: (-item[1], item[0]))[:TOP_N]]


def streak_weeks(activity: list[datetime], now: datetime) -> int:
    """Consecutive weeks (Monday start) with any activity, ending this week.

    A week with nothing logged yet doesn't break the streak until it's over,
    so the count starts from last week when this week is still empty.
    """
    current = _week(now.date())
    weeks = {_week(moment.date()) for moment in activity if moment <= now}
    week = current if current in weeks else current - 1
    count = 0
    while week in weeks:
        count += 1
        week -= 1
    return count


def personality(notes: list[str], toppings: list[str], weights: dict[str, float]) -> str:
    """A flavor word from what they like, plus an archetype from what they weigh most."""
    if "brown sugar pearls" in toppings[:1] or (notes and notes[0] == "brown_sugar"):
        flavor = "Brown Sugar"
    elif notes:
        flavor = FLAVOR_WORDS.get(notes[0], "Milk Tea")
    else:
        flavor = "Milk Tea"
    top = max(DIMENSIONS, key=lambda dim: (weights.get(dim, 0.0), dim))
    return f"{flavor} {ARCHETYPES[top]}"


def boba_stats(
    catalog: Catalog,
    user_id: str,
    *,
    profile: dict[str, float],
    weights: dict[str, float],
    picks: list[str],
    activity: list[datetime],
    now: datetime,
    quiz_toppings: list[str] | None = None,
    quiz_shop_id: str | None = None,
) -> BobaStats:
    rated = rated_drinks(catalog, user_id, picks)
    liked = rated
    if not rated:
        # Nothing tried yet: describe the drinks their quiz profile matches best.
        ranked = sorted(catalog.drinks, key=lambda drink: (-match_score(profile, drink.attributes), drink.id))
        liked = [(drink, 5) for drink in ranked[:QUIZ_MATCHES]]

    notes = top_notes(liked)
    toppings = list(quiz_toppings) if quiz_toppings is not None and not rated else go_to_toppings(liked)
    milk = profile.get("milkiness", 0.5)
    fruit = profile.get("fruitiness", 0.5)
    return BobaStats(
        fav_drink_id=_favorite_drink(rated),
        fav_shop_id=_favorite_shop(rated) or quiz_shop_id,
        sweetness=round(profile.get("sweetness", 0.5), 3),
        toppings=toppings,
        milk_vs_fruit=round(milk / (milk + fruit), 3) if milk + fruit > 0 else 0.5,
        tried_count=len(rated),
        shops_visited=len({drink.shop_id for drink, _rating in rated}),
        streak_weeks=streak_weeks(activity, now),
        top_notes=notes,
        priorities={dim: round(weights.get(dim, 0.0), 4) for dim in DIMENSIONS},
        personality=personality(notes, toppings, weights),
    )


def _favorite_drink(rated: list[tuple[Drink, int]]) -> str | None:
    """Highest rated; ties go to the one they tried first."""
    best: tuple[int, int, str] | None = None
    for index, (drink, rating) in enumerate(rated):
        key = (rating, -index, drink.id)
        if best is None or key > best:
            best = key
    return best[2] if best else None


def _favorite_shop(rated: list[tuple[Drink, int]]) -> str | None:
    tally: Counter[str] = Counter()
    for drink, rating in rated:
        if rating >= LIKED_AT:
            tally[drink.shop_id] += rating
    if not tally:
        return None
    return sorted(tally.items(), key=lambda item: (-item[1], item[0]))[0][0]


def _week(day: date) -> int:
    return (day - EPOCH_MONDAY).days // 7
