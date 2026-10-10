"""User-to-user taste similarity.

TODO: rank users by cosine similarity of their taste profiles and use that
ranking in the social agent. The functions below keep imports working and
return neutral values until that math is filled in.
"""

from __future__ import annotations


def cosine_similarity(left: dict[str, float], right: dict[str, float]) -> float:
    """TODO: cosine similarity between two attribute dictionaries.

    Returns 0.0 until the social math is implemented.
    """
    del left, right
    return 0.0


def most_similar_users(
    user_id: str, profiles: dict[str, dict[str, float]], k: int = 3
) -> list[str]:
    """TODO: return up to k other user ids with the closest taste profiles.

    Returns an empty list until the social math is implemented.
    """
    del user_id, profiles, k
    return []
