"""Explorer agent: something new, but only among drinks the user would plausibly enjoy."""

from __future__ import annotations

from typing import Any

from tealink.agents.objective_agent import ObjectiveAgent
from tealink.core import objectives
from tealink.data.loader import Catalog
from tealink.schemas import DeliberationRequest, Drink

PLAUSIBLE_TASTE = 0.6


class ExplorerAgent(ObjectiveAgent):
    agent_id = "explorer"
    dimension = "novelty"
    name = "Explorer"
    description = "Suggests drinks unlike your past orders that you would still plausibly enjoy."

    def objective(
        self, request: DeliberationRequest, catalog: Catalog, drink: Drink, ctx: Any
    ) -> tuple[float, str]:
        return objectives.novelty(catalog, request.user_id, drink)

    def eligible(
        self, request: DeliberationRequest, catalog: Catalog, drink: Drink, ctx: Any
    ) -> bool:
        taste, _factors = objectives.taste(catalog, request.user_id, drink, request.preference_overrides)
        return drink.available and taste >= PLAUSIBLE_TASTE
