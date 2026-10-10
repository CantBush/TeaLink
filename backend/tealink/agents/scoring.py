"""Shared deterministic scoring used by every agent."""

from __future__ import annotations

from tealink.core.taste import factor_contributions, match_score, taste_profile
from tealink.data.loader import Catalog
from tealink.schemas import Drink, FactorContribution


def user_profile(catalog: Catalog, user_id: str) -> dict[str, float]:
    return taste_profile(catalog.reviews_for(user_id), catalog.drinks_by_id)


def score_drink(
    profile: dict[str, float],
    drink: Drink,
    overrides: dict[str, float] | None,
) -> tuple[float, list[FactorContribution]]:
    score = match_score(profile, drink.attributes, overrides)
    factors = factor_contributions(profile, drink.attributes, overrides)
    return score, factors
