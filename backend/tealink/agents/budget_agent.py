"""Budget teagent: the cheapest drinks the user would still enjoy."""

from __future__ import annotations

from typing import Any

from tealink.agents.objective_agent import ObjectiveAgent
from tealink.core import objectives
from tealink.data.loader import Catalog
from tealink.schemas import DeliberationRequest, Drink

PLAUSIBLE_TASTE = 0.7


class BudgetAgent(ObjectiveAgent):
    agent_id = "budget"
    dimension = "cost"
    name = "Budget"
    description = "Argues for the cheapest drinks that still fit your taste."

    def objective(
        self, request: DeliberationRequest, catalog: Catalog, drink: Drink, ctx: Any
    ) -> tuple[float, str]:
        return objectives.cost(catalog, drink)

    def eligible(
        self, request: DeliberationRequest, catalog: Catalog, drink: Drink, ctx: Any
    ) -> bool:
        taste, _factors = objectives.taste(catalog, request.user_id, drink, request.preference_overrides)
        return drink.available and taste >= PLAUSIBLE_TASTE
