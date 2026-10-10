"""Shared deterministic taste scoring.

Overrides keyed by a taste attribute replace that profile value. Overrides
keyed by a flavor tag (for example ``brown_sugar``) scale the match for drinks
with that tag: 0 halves it, 1 leaves it alone. The tag's effect is reported as
its own factor so the factors still sum to the score.
"""

from __future__ import annotations

from tealink.core.taste import factor_contributions, match_score, taste_profile
from tealink.data.loader import Catalog
from tealink.schemas import ATTRIBUTES, Drink, FactorContribution

TAG_FLOOR = 0.5


def user_profile(catalog: Catalog, user_id: str) -> dict[str, float]:
    return taste_profile(
        catalog.reviews_for(user_id),
        catalog.drinks_by_id,
        base=catalog.base_profiles.get(user_id),
    )


def score_drink(
    profile: dict[str, float],
    drink: Drink,
    overrides: dict[str, float] | None,
) -> tuple[float, list[FactorContribution]]:
    overrides = overrides or {}
    score = match_score(profile, drink.attributes, overrides)
    factors = factor_contributions(profile, drink.attributes, overrides)
    for tag, value in sorted(overrides.items()):
        if tag in ATTRIBUTES or tag not in drink.flavor_tags:
            continue
        keep = TAG_FLOOR + (1.0 - TAG_FLOOR) * max(0.0, min(1.0, float(value)))
        penalty = score * (1.0 - keep)
        if penalty <= 0.0:
            continue
        score -= penalty
        factors.append(FactorContribution(factor=tag, weight=-penalty))
    return score, factors
