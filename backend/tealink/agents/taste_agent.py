"""Taste agent: how well a drink fits this user's own reviews."""

from __future__ import annotations

from typing import Any

from tealink.agents.objective_agent import ObjectiveAgent
from tealink.core import objectives
from tealink.data.loader import Catalog
from tealink.schemas import DeliberationRequest, Drink


class TasteAgent(ObjectiveAgent):
    agent_id = "taste"
    dimension = "taste"
    name = "Taste"
    description = "Builds a taste profile from your reviews and ranks the menu by fit."

    def objective(
        self, request: DeliberationRequest, catalog: Catalog, drink: Drink, ctx: Any
    ) -> tuple[float, str]:
        score, factors = objectives.taste(catalog, request.user_id, drink, request.preference_overrides)
        top = [factor for factor in factors if factor.weight > 0][:2]
        penalties = [factor for factor in factors if factor.weight < 0]
        bits = ", ".join(factor.factor.replace("_", " ") for factor in top)
        detail = f"{round(score * 100)}% taste match"
        if bits:
            detail += f", strongest on {bits}"
        for factor in penalties:
            detail += f"; marked down for {factor.factor.replace('_', ' ')}"
        return score, detail + "."
