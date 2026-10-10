"""Taste profile, match score, and factor contributions.

All of these are deterministic. An LLM never produces the numbers.
"""

from __future__ import annotations

import numpy as np

from tealink.schemas import ATTRIBUTES, Drink, FactorContribution, Review


def apply_overrides(
    profile: dict[str, float], overrides: dict[str, float] | None
) -> dict[str, float]:
    """Replace profile attributes named in overrides and clamp each to 0-1."""
    adjusted = {attr: _clamp(profile.get(attr, 0.5)) for attr in ATTRIBUTES}
    for key, value in (overrides or {}).items():
        if key in adjusted:
            adjusted[key] = _clamp(value)
    return adjusted


BASE_PROFILE_WEIGHT = 3.0


def taste_profile(
    reviews: list[Review],
    drinks_by_id: dict[str, Drink],
    base: dict[str, float] | None = None,
) -> dict[str, float]:
    """Weighted average of reviewed drink vectors. Weight is rating / 5.

    ``base`` (a quiz profile) counts as BASE_PROFILE_WEIGHT five-star
    reviews, so a new user's first reviews move it rather than replace it.
    Missing drinks are skipped. With no usable reviews or base, every
    attribute is 0.5.
    """
    weighted = np.zeros(len(ATTRIBUTES), dtype=float)
    weight_sum = 0.0
    if base is not None:
        weighted += np.array([float(base.get(attr, 0.5)) for attr in ATTRIBUTES]) * BASE_PROFILE_WEIGHT
        weight_sum += BASE_PROFILE_WEIGHT
    for review in reviews:
        drink = drinks_by_id.get(review.drink_id)
        if drink is None:
            continue
        weight = review.rating / 5.0
        vector = np.array(
            [float(drink.attributes[attr]) for attr in ATTRIBUTES], dtype=float
        )
        weighted += vector * weight
        weight_sum += weight
    if weight_sum == 0.0:
        return {attr: 0.5 for attr in ATTRIBUTES}
    averaged = weighted / weight_sum
    return {
        attr: float(np.clip(averaged[index], 0.0, 1.0))
        for index, attr in enumerate(ATTRIBUTES)
    }


def match_score(
    profile: dict[str, float],
    attributes: dict[str, float],
    overrides: dict[str, float] | None = None,
) -> float:
    """1 minus the mean absolute difference across the five attributes."""
    adjusted = apply_overrides(profile, overrides)
    diffs = [
        abs(adjusted[attr] - float(attributes[attr])) for attr in ATTRIBUTES
    ]
    score = 1.0 - (sum(diffs) / len(ATTRIBUTES))
    return float(max(0.0, min(1.0, score)))


def factor_contributions(
    profile: dict[str, float],
    attributes: dict[str, float],
    overrides: dict[str, float] | None = None,
) -> list[FactorContribution]:
    """Per-attribute weights that sum exactly to the match score.

    Each weight is ``(1 - abs(profile - drink)) / 5``. That is the attribute's
    share of ``1 - mean absolute difference``, so the five weights sum to the
    match score without a second scaling pass. A larger gap produces a smaller
    weight. ``FactorContribution.weight`` is a signed float; this split stays
    in ``[0, 0.2]``. The list is sorted by absolute weight, descending, then
    by factor name.
    """
    adjusted = apply_overrides(profile, overrides)
    weights = [
        (1.0 - abs(adjusted[attr] - float(attributes[attr]))) / len(ATTRIBUTES)
        for attr in ATTRIBUTES
    ]
    factors = [
        FactorContribution(factor=attr, weight=float(weight))
        for attr, weight in zip(ATTRIBUTES, weights, strict=True)
    ]
    factors.sort(key=lambda factor: (-abs(factor.weight), factor.factor))
    return factors


def mean_absolute_difference(
    left: dict[str, float], right: dict[str, float]
) -> float:
    diffs = [abs(float(left[attr]) - float(right[attr])) for attr in ATTRIBUTES]
    return sum(diffs) / len(ATTRIBUTES)


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, float(value)))
