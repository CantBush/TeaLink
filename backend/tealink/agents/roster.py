"""Default in-process agent team."""

from __future__ import annotations

from tealink.agents.base import BaseAgent
from tealink.agents.explorer_agent import ExplorerAgent
from tealink.agents.shop_agent import ShopAgent
from tealink.agents.social_agent import SocialAgent
from tealink.agents.taste_agent import TasteAgent
from tealink.data.loader import Catalog


def default_agents(catalog: Catalog) -> list[BaseAgent]:
    agents: list[BaseAgent] = [TasteAgent(), SocialAgent(), ExplorerAgent()]
    for shop in catalog.shops:
        agents.append(ShopAgent(shop.id, shop.name))
    return agents


def make_agent(kind: str, shop_id: str | None = None, shop_name: str | None = None) -> BaseAgent:
    if kind == "taste":
        return TasteAgent()
    if kind == "social":
        return SocialAgent()
    if kind == "explorer":
        return ExplorerAgent()
    if kind == "shop":
        if not shop_id:
            raise ValueError("shop agent requires shop_id")
        return ShopAgent(shop_id, shop_name)
    raise ValueError(f"unknown agent kind {kind}")
