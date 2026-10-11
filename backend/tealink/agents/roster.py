"""Default in-process teagent team."""

from __future__ import annotations

from tealink.agents.base import BaseAgent
from tealink.agents.budget_agent import BudgetAgent
from tealink.agents.explorer_agent import ExplorerAgent
from tealink.agents.preference_agent import PreferenceAgent
from tealink.agents.shop_agent import ShopAgent
from tealink.agents.social_agent import SocialAgent
from tealink.agents.taste_agent import TasteAgent
from tealink.data.loader import Catalog, load_choices
from tealink.schemas import ChoiceRecord

AGENT_KINDS = ("taste", "social", "explorer", "budget", "preference", "shop")


def default_agents(catalog: Catalog, history: list[ChoiceRecord] | None = None) -> list[BaseAgent]:
    """Core teagents plus one teagent per shop that is online at startup.

    Shops seeded with ``online=False`` join later through ``/events/shop-join``.
    """
    agents: list[BaseAgent] = [
        TasteAgent(),
        SocialAgent(),
        ExplorerAgent(),
        BudgetAgent(),
        PreferenceAgent(history if history is not None else load_choices()),
    ]
    for shop in catalog.shops:
        if shop.online:
            agents.append(ShopAgent(shop.id, shop.name, shop.promo_budget))
    return agents


def make_agent(kind: str, shop_id: str | None = None, shop_name: str | None = None) -> BaseAgent:
    if kind == "taste":
        return TasteAgent()
    if kind == "social":
        return SocialAgent()
    if kind == "explorer":
        return ExplorerAgent()
    if kind == "budget":
        return BudgetAgent()
    if kind == "preference":
        return PreferenceAgent(load_choices())
    if kind == "shop":
        if not shop_id:
            raise ValueError("shop teagent requires shop_id")
        return ShopAgent(shop_id, shop_name)
    raise ValueError(f"unknown agent kind {kind}")
