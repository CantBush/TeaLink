"""Popularity ranks the most-reviewed in-stock drink the user has not tried."""

from tealink.core.baseline import held_out_hit_rate, popularity_ranking
from tealink.schemas import ATTRIBUTES, Drink, Review


def _drink(drink_id: str, shop_id: str = "shop", available: bool = True) -> Drink:
    return Drink(
        id=drink_id,
        name=drink_id,
        shop_id=shop_id,
        price=5.0,
        attributes={attr: 0.5 for attr in ATTRIBUTES},
        flavor_tags=[],
        available=available,
    )


def _review(user_id: str, drink_id: str, rating: int) -> Review:
    return Review(
        id=f"{user_id}-{drink_id}-{rating}",
        user_id=user_id,
        drink_id=drink_id,
        rating=rating,
        text="ok",
    )


def test_popularity_skips_tried_and_sold_out_and_ranks_by_review_count():
    drinks = [
        _drink("tried"),
        _drink("sold_out"),
        _drink("closed", shop_id="closed"),
        _drink("gone", available=False),
        _drink("few"),
        _drink("many_low"),
        _drink("many_high"),
    ]
    reviews = [
        _review("andrew", "tried", 5),
        _review("maya", "tried", 5),
        _review("maya", "tried", 5),
        _review("leo", "sold_out", 5),
        _review("hana", "sold_out", 5),
        _review("rina", "sold_out", 5),
        _review("leo", "few", 5),
        _review("hana", "many_low", 2),
        _review("rina", "many_low", 2),
        _review("maya", "many_low", 2),
        _review("leo", "many_high", 5),
        _review("rina", "many_high", 4),
        _review("maya", "many_high", 5),
        _review("jordan", "closed", 5),
        _review("jordan", "closed", 5),
        _review("jordan", "closed", 5),
        _review("jordan", "closed", 5),
    ]

    ranked = popularity_ranking(
        reviews,
        drinks,
        user_id="andrew",
        online_shop_ids={"shop"},
        sold_out_ids={"sold_out"},
    )

    assert [item.drink_id for item in ranked] == ["many_high", "many_low", "few"]
    assert ranked[0].score == 14 / 3 / 5


def test_held_out_hit_rate_counts_overlap():
    assert held_out_hit_rate(["a", "b"], ["b", "c"]) == 0.5
    assert held_out_hit_rate(["a"], []) == 0.0
