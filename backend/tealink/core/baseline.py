"""Non-teagent baseline: the most-reviewed in-stock drink the user has not tried."""

from __future__ import annotations

from tealink.schemas import Drink, RankedDrink, Review


def popularity_ranking(
    reviews: list[Review],
    drinks: list[Drink],
    *,
    user_id: str,
    online_shop_ids: set[str] | None = None,
    sold_out_ids: set[str] | None = None,
    limit: int = 3,
) -> list[RankedDrink]:
    """Rank drinks this user has not reviewed.

    In-stock means the drink is available and not in ``sold_out_ids``. When
    ``online_shop_ids`` is set, a drink whose shop is offline is left out.
    Most-reviewed comes first, then higher mean rating, then drink id.
    ``score`` is the mean rating divided by 5, or 0 when nobody has reviewed it.
    """
    ratings: dict[str, list[int]] = {}
    tried: set[str] = set()
    for review in reviews:
        ratings.setdefault(review.drink_id, []).append(review.rating)
        if review.user_id == user_id:
            tried.add(review.drink_id)

    sold_out = sold_out_ids or set()
    ranked: list[tuple[int, float, Drink]] = []
    for drink in drinks:
        if drink.id in tried or drink.id in sold_out or not drink.available:
            continue
        if online_shop_ids is not None and drink.shop_id not in online_shop_ids:
            continue
        scores = ratings.get(drink.id, [])
        mean = sum(scores) / len(scores) if scores else 0.0
        ranked.append((len(scores), mean, drink))

    ranked.sort(key=lambda item: (-item[0], -item[1], item[2].id))
    return [
        RankedDrink(
            drink_id=drink.id,
            drink_name=drink.name,
            score=mean / 5.0,
            shop_id=drink.shop_id,
            price=drink.price,
        )
        for _count, mean, drink in ranked[:limit]
    ]


def held_out_hit_rate(recommendations: list[str], held_out_drink_ids: list[str]) -> float:
    """Fraction of held-out drinks that appear in the recommendations."""
    if not held_out_drink_ids:
        return 0.0
    recommended = set(recommendations)
    return sum(drink_id in recommended for drink_id in held_out_drink_ids) / len(held_out_drink_ids)
