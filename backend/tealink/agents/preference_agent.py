"""Preference agent: learns how much each user weighs taste, friends, novelty, and cost.

Its private data is the user's choice log: past picks (seeded history) plus
every pick made from a top 3 in this session. It never sees reviews or menus.
"""

from __future__ import annotations

from tealink.agents.base import BaseAgent
from tealink.agents.cards import CAPABILITIES, AgentCardInfo
from tealink.core import preferences
from tealink.data.loader import Catalog, load_choices
from tealink.schemas import AgentReply, ChoiceRecord, DeliberationRequest, PreferenceReport


class PreferenceAgent(BaseAgent):
    agent_id = "preference"

    def __init__(self, history: list[ChoiceRecord] | None = None) -> None:
        self.history: dict[str, list[ChoiceRecord]] = {}
        for choice in history or []:
            self.history.setdefault(choice.user_id, []).append(choice)

    def reset(self) -> None:
        """Drop live picks and reload the seeded history. The demo reset uses this."""
        self.history.clear()
        for choice in load_choices():
            self.history.setdefault(choice.user_id, []).append(choice)

    def card(self) -> AgentCardInfo:
        return AgentCardInfo(
            id=self.agent_id,
            name="Preference",
            description="Learns how much the user weighs taste, friends, novelty, and cost from their picks.",
            capabilities=CAPABILITIES["preference"],
        )

    def handle(self, request: DeliberationRequest, catalog: Catalog) -> AgentReply:
        prior = request.prior_weights
        if request.round == "learn" and request.choice is not None:
            return AgentReply(agent_id=self.agent_id, preference=self.learn(request.choice, prior))
        if request.round == "propose":
            return AgentReply(agent_id=self.agent_id, preference=self.report(request.user_id, prior))
        return AgentReply(agent_id=self.agent_id)

    def weights(self, user_id: str, prior: dict[str, float] | None = None) -> dict[str, float]:
        """Picks learned on top of the quiz weights, or the default prior."""
        return preferences.fit(self.history.get(user_id, []), prior)

    def report(self, user_id: str, prior: dict[str, float] | None = None) -> PreferenceReport:
        seen = len(self.history.get(user_id, []))
        weights = self.weights(user_id, prior)
        return PreferenceReport(
            user_id=user_id,
            weights=weights,
            choices_seen=seen,
            summary=preferences.describe_weights(weights, seen, from_quiz=prior is not None),
        )

    def learn(self, choice: ChoiceRecord, prior: dict[str, float] | None = None) -> PreferenceReport:
        before = self.weights(choice.user_id, prior)
        self.history.setdefault(choice.user_id, []).append(choice)
        after = self.weights(choice.user_id, prior)
        return PreferenceReport(
            user_id=choice.user_id,
            weights=after,
            previous_weights=before,
            choices_seen=len(self.history[choice.user_id]),
            summary=preferences.describe_choice(before, after, choice),
        )
