"""Agent interface shared by local and AGNTCY transports."""

from __future__ import annotations

from tealink.agents.cards import AgentCardInfo
from tealink.data.loader import Catalog
from tealink.schemas import DeliberationRequest, AgentReply, Drink


class BaseAgent:
    agent_id: str

    def card(self) -> AgentCardInfo:
        raise NotImplementedError

    def handle(self, request: DeliberationRequest, catalog: Catalog) -> AgentReply:
        raise NotImplementedError


def orderable(drink: Drink, sold_out: list[str] | set[str]) -> bool:
    return drink.available and drink.id not in sold_out
