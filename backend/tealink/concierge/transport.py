"""In-process transport, plus a placeholder for A2A over NATS.

``AgentCardInfo`` is the card the registry stores. It stands in for an a2a
``AgentCard`` so local mode does not import the SDK.
"""

from __future__ import annotations

from typing import Protocol

from tealink.agents.base import BaseAgent
from tealink.agents.cards import AgentCardInfo
from tealink.data.loader import Catalog
from tealink.schemas import AgentReply, DeliberationRequest

_AGNTCY_MESSAGE = "AGNTCY transport is not wired. Set TRANSPORT=local."


class AgentTransport(Protocol):
    async def send(self, card: AgentCardInfo, msg: DeliberationRequest) -> AgentReply: ...

    async def broadcast(
        self, cards: list[AgentCardInfo], msg: DeliberationRequest
    ) -> list[AgentReply]: ...


class LocalTransport:
    def __init__(self, agents: dict[str, BaseAgent], catalog: Catalog) -> None:
        self.agents = agents
        self.catalog = catalog

    async def send(self, card: AgentCardInfo, msg: DeliberationRequest) -> AgentReply:
        agent = self.agents.get(card.id)
        if agent is None:
            return AgentReply(agent_id=card.id)
        return agent.handle(msg, self.catalog)

    async def broadcast(
        self, cards: list[AgentCardInfo], msg: DeliberationRequest
    ) -> list[AgentReply]:
        return [await self.send(card, msg) for card in cards]


class AgntcyTransport:
    """Minimal stand-in. The NATS spike lives in ``agents.serve``.

    Broadcast from the gateway stays on LocalTransport until that spike is
    the default. Calling this raises a clear error instead of hanging.
    """

    async def send(self, card: AgentCardInfo, msg: DeliberationRequest) -> AgentReply:
        raise NotImplementedError(_AGNTCY_MESSAGE)

    async def broadcast(
        self, cards: list[AgentCardInfo], msg: DeliberationRequest
    ) -> list[AgentReply]:
        raise NotImplementedError(_AGNTCY_MESSAGE)
