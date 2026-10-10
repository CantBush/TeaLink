"""One scoring function per agent objective. Every score is 0-1, higher is better.

Each agent owns exactly one of these. The resolver blends them with the
weights the Preference agent learned for the user.
"""

from __future__ import annotations

from tealink.agents.scoring import score_drink, user_profile
from tealink.core.similarity import most_similar_users
from tealink.core.taste import mean_absolute_difference
from tealink.data.loader import Catalog
from tealink.schemas import Drink, FactorContribution

NOVELTY_DISTANCE = 0.3
NEUTRAL = 0.5


def taste(
    catalog: Catalog, user_id: str, drink: Drink, overrides: dict[str, float] | None
) -> tuple[float, list[FactorContribution]]:
    return score_drink(user_profile(catalog, user_id), drink, overrides)


def neighbors(catalog: Catalog, user_id: str, k: int = 3) -> list[tuple[str, float]]:
    profiles = {user.id: user_profile(catalog, user.id) for user in catalog.users}
    return most_similar_users(user_id, profiles, k=k)


def social(
    catalog: Catalog, drink: Drink, near: list[tuple[str, float]]
) -> tuple[float, str]:
    """Similarity-weighted rating from the user's nearest neighbors.

    No ratings means no evidence either way, so the score is neutral (0.5)
    rather than 0. Otherwise every new shop would look disliked.
    """
    total = 0.0
    weight = 0.0
    best: tuple[float, str, int] | None = None
    for other_id, similarity in near:
        for review in catalog.reviews_for(other_id):
            if review.drink_id != drink.id:
                continue
            total += similarity * (review.rating - 1) / 4.0
            weight += similarity
            if best is None or (similarity, review.rating) > (best[0], best[2]):
                best = (similarity, other_id, review.rating)
    if weight == 0.0 or best is None:
        return NEUTRAL, "No one with similar taste has rated it yet."
    user = catalog.users_by_id.get(best[1])
    name = user.name if user else best[1]
    return total / weight, f"{name} ({round(best[0] * 100)}% similar) rated it {best[2]}/5."


def novelty(catalog: Catalog, user_id: str, drink: Drink) -> tuple[float, str]:
    """0 for drinks already reviewed; 0.5-1 for new ones, higher when unlike past orders."""
    reviews = catalog.reviews_for(user_id)
    for review in reviews:
        if review.drink_id == drink.id:
            return 0.0, f"Already reviewed it ({review.rating}/5)."
    tried = [catalog.drink(review.drink_id) for review in reviews]
    tried = [item for item in tried if item is not None]
    if not tried:
        return 1.0, "New to you."
    closest = min(tried, key=lambda item: (mean_absolute_difference(item.attributes, drink.attributes), item.id))
    distance = mean_absolute_difference(closest.attributes, drink.attributes)
    score = 0.5 + 0.5 * min(1.0, distance / NOVELTY_DISTANCE)
    return score, f"New to you. Closest past order: {closest.name}."


def cost(catalog: Catalog, drink: Drink) -> tuple[float, str]:
    """1 for the cheapest drink in the catalog, 0 for the most expensive."""
    prices = [item.price for item in catalog.drinks]
    low, high = min(prices), max(prices)
    if high == low:
        return 1.0, f"${drink.price:.2f}."
    cheaper_than = sum(1 for price in prices if price > drink.price) / len(prices)
    score = 1.0 - (drink.price - low) / (high - low)
    return score, f"${drink.price:.2f}, cheaper than {round(cheaper_than * 100)}% of drinks."
