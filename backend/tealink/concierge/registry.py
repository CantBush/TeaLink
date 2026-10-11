"""In-memory agent cards, capability selection, and heartbeats."""

from __future__ import annotations

from datetime import datetime, timezone

from tealink.agents.cards import AgentCardInfo
from tealink.schemas import AgentSelection

HEARTBEAT_TTL_SECONDS = 30.0

CORE_AGENTS = ("taste", "social", "explorer", "budget", "preference")

_CORE_REASONS = {
    "taste": "Selected Taste: it ranks drinks by fit to your own reviews{query}.",
    "social": "Selected Social: it knows what your most similar people loved{query}.",
    "explorer": "Selected Explorer: it argues for drinks you haven't tried{query}.",
    "budget": "Selected Budget: it argues for cheaper drinks that still fit{query}.",
    "preference": "Selected Preference: it knows how much you weigh taste, friends, novelty, and price.",
}


class Registry:
    def __init__(self) -> None:
        self._cards: dict[str, AgentCardInfo] = {}
        self._heartbeats: dict[str, datetime] = {}

    def register(self, card: AgentCardInfo) -> None:
        self._cards[card.id] = card
        self.heartbeat(card.id)

    def heartbeat(self, agent_id: str, now: datetime | None = None) -> None:
        self._heartbeats[agent_id] = now or datetime.now(timezone.utc)

    def mark_offline(self, agent_id: str) -> None:
        self._heartbeats.pop(agent_id, None)

    def get(self, agent_id: str) -> AgentCardInfo | None:
        return self._cards.get(agent_id)

    def list(self) -> list[AgentCardInfo]:
        return [self._cards[key] for key in sorted(self._cards)]

    def is_online(self, agent_id: str, now: datetime | None = None) -> bool:
        last = self._heartbeats.get(agent_id)
        if last is None:
            return False
        current = now or datetime.now(timezone.utc)
        return (current - last).total_seconds() <= HEARTBEAT_TTL_SECONDS

    def select_for_query(self, query: str, now: datetime | None = None) -> list[AgentSelection]:
        """Online core agents by capability, plus every online shop agent."""
        suffix = f" to answer '{query}'" if query else ""
        selected: list[AgentSelection] = []
        for agent_id in CORE_AGENTS:
            card = self._cards.get(agent_id)
            if card is None or not self.is_online(agent_id, now=now):
                continue
            selected.append(
                AgentSelection(
                    agent_id=card.id,
                    name=card.name,
                    description=card.description,
                    capabilities=list(card.capabilities),
                    reason=_CORE_REASONS[agent_id].format(query=suffix),
                )
            )
        shops = [
            card
            for card in self._cards.values()
            if card.shop_id and self.is_online(card.id, now=now)
        ]
        shops.sort(key=lambda card: card.id)
        for card in shops:
            selected.append(
                AgentSelection(
                    agent_id=card.id,
                    name=card.name,
                    description=card.description,
                    capabilities=list(card.capabilities),
                    reason=f"Selected {card.name}: it is online and can confirm what is in stock.",
                )
            )
        return selected
