"""A deterministic, opt-in reviewer for the arbiter's tentative winner.

The Critic deliberately runs after scoring, rather than participating in the
vote: it challenges the current #1 and makes the arbiter's response visible
without changing the objective agents' scores.
"""

from __future__ import annotations

from tealink.schemas import DIMENSIONS, Critique, Decision


class CriticAgent:
    agent_id = "critic"

    def review(self, decision: Decision) -> Critique | None:
        if not decision.drink_id or not decision.options:
            return None
        winner = decision.options[0]
        weakest = min(DIMENSIONS, key=lambda dimension: (winner.dimension_scores.get(dimension, 0.0), dimension))
        score = winner.dimension_scores.get(weakest, 0.0)
        return Critique(
            drink_id=winner.drink_id,
            weakest_reason=(
                f"{winner.drink_name}'s weakest case is {weakest}: "
                f"{round(score * 100)}%."
            ),
            answered=True,
            changed_pick=False,
        )
