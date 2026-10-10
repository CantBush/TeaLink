"""User-to-user taste similarity.

Profiles are centered on 0.5 before the cosine, so "likes sweet" and "dislikes
sweet" point in opposite directions. Raw 0-1 profiles are all positive and
would make every pair of users look about 95% alike.
"""

from __future__ import annotations

import math

from tealink.schemas import ATTRIBUTES


def cosine_similarity(left: dict[str, float], right: dict[str, float]) -> float:
    """Cosine of the two profiles centered on 0.5, mapped to 0-1."""
    a = [float(left[attr]) - 0.5 for attr in ATTRIBUTES]
    b = [float(right[attr]) - 0.5 for attr in ATTRIBUTES]
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    if norm == 0.0:
        return 0.5
    cosine = sum(x * y for x, y in zip(a, b, strict=True)) / norm
    return (cosine + 1.0) / 2.0


def most_similar_users(
    user_id: str, profiles: dict[str, dict[str, float]], k: int = 3
) -> list[tuple[str, float]]:
    """Up to k other users with the closest profiles, most similar first."""
    target = profiles.get(user_id)
    if target is None:
        return []
    scored = [
        (other_id, cosine_similarity(target, profile))
        for other_id, profile in profiles.items()
        if other_id != user_id
    ]
    scored.sort(key=lambda item: (-item[1], item[0]))
    return scored[:k]
