"""Social agent: drinks the user's most similar neighbors rated highly."""

from __future__ import annotations

from typing import Any

from tealink.agents.objective_agent import ObjectiveAgent
from tealink.core import objectives
from tealink.data.loader import Catalog
from tealink.schemas import DeliberationRequest, Drink

PLAUSIBLE_TASTE = 0.5


class SocialAgent(ObjectiveAgent):
    agent_id = "social"
    dimension = "social"
    name = "Social"
    description = "Finds your most similar people and suggests drinks they rated highly."

    def context(self, request: DeliberationRequest, catalog: Catalog) -> Any:
        return objectives.neighbors(catalog, request.user_id)

    def objective(
        self, request: DeliberationRequest, catalog: Catalog, drink: Drink, ctx: Any
    ) -> tuple[float, str]:
        return objectives.social(catalog, drink, ctx)

    def eligible(
        self, request: DeliberationRequest, catalog: Catalog, drink: Drink, ctx: Any
    ) -> bool:
        tried = {review.drink_id for review in catalog.reviews_for(request.user_id)}
        if not drink.available or drink.id in tried:
            return False
        taste, _factors = objectives.taste(catalog, request.user_id, drink, request.preference_overrides)
        return taste >= PLAUSIBLE_TASTE
