"""Non-agent baseline used by the offline eval.

TODO: rank drinks by mean rating, hide each user's held-out reviews, and
compare that popularity list to the agent team on hit rate, sold-out picks,
and repeat picks. The functions below are callable stubs.
"""

from __future__ import annotations

from tealink.schemas import Drink, RankedDrink, Review


def popularity_ranking(reviews: list[Review], drinks: list[Drink]) -> list[RankedDrink]:
    """TODO: rank drinks by mean rating as the non-agent baseline.

    Returns an empty list until Phase 4.
    """
    del reviews, drinks
    return []


def held_out_hit_rate(
    recommendations: list[str], held_out_drink_ids: list[str]
) -> float:
    """TODO: fraction of held-out drinks that appear in the recommendations.

    Returns 0.0 until Phase 4.
    """
    del recommendations, held_out_drink_ids
    return 0.0
