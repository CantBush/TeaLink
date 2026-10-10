"""Taste agent: real profile, match score, factors, and review evidence."""

from __future__ import annotations

from tealink.agents.base import BaseAgent, orderable
from tealink.agents.cards import CAPABILITIES, AgentCardInfo
from tealink.agents.scoring import score_drink, user_profile
from tealink.core.retrieval import retrieve_evidence
from tealink.data.loader import Catalog
from tealink.schemas import (
    AgentReply,
    DeliberationRequest,
    Drink,
    FactorContribution,
    Objection,
    ObjectionKind,
    Proposal,
)


class TasteAgent(BaseAgent):
    agent_id = "taste"

    def card(self) -> AgentCardInfo:
        return AgentCardInfo(
            id=self.agent_id,
            name="Taste",
            description="Builds a taste profile from this user's reviews and ranks the menu.",
            capabilities=CAPABILITIES["taste"],
        )

    def handle(self, request: DeliberationRequest, catalog: Catalog) -> AgentReply:
        if request.round == "object":
            return AgentReply(agent_id=self.agent_id, objections=self._objections(request, catalog))
        proposal = self._proposal(request, catalog)
        return AgentReply(
            agent_id=self.agent_id,
            proposals=[proposal] if proposal is not None else [],
        )

    def _proposal(self, request: DeliberationRequest, catalog: Catalog) -> Proposal | None:
        ranked = self._ranked(request, catalog)
        if not ranked:
            return None
        drink, score, factors = ranked[0]
        evidence = retrieve_evidence(
            catalog.reviews_for(request.user_id),
            catalog.drinks_by_id,
            drink,
            k=3,
        )
        return Proposal(
            agent_id=self.agent_id,
            drink_id=drink.id,
            drink_name=drink.name,
            shop_id=drink.shop_id,
            score=score,
            factors=factors,
            evidence=evidence,
            rationale=_rationale(drink.name, score, factors),
        )

    def _objections(
        self, request: DeliberationRequest, catalog: Catalog
    ) -> list[Objection]:
        ranked = {drink.id: (drink, score) for drink, score, _factors in self._ranked(request, catalog)}
        objections: list[Objection] = []
        for drink_id in request.candidate_drink_ids:
            scored = ranked.get(drink_id)
            if scored is None:
                objections.append(
                    Objection(
                        agent_id=self.agent_id,
                        target_drink_id=drink_id,
                        kind=ObjectionKind.concern,
                        reason="This drink is unavailable or missing from the catalog.",
                    )
                )
                continue
            _drink, score = scored
            if score < 0.45:
                kind = ObjectionKind.concern
                reason = f"Taste match is only {score:.2f} for this user."
            else:
                kind = ObjectionKind.support
                reason = f"Taste match is {score:.2f} for this user."
            objections.append(
                Objection(
                    agent_id=self.agent_id,
                    target_drink_id=drink_id,
                    kind=kind,
                    reason=reason,
                )
            )
        return objections

    def _ranked(
        self, request: DeliberationRequest, catalog: Catalog
    ) -> list[tuple[Drink, float, list[FactorContribution]]]:
        profile = user_profile(catalog, request.user_id)
        ranked: list[tuple[Drink, float, list[FactorContribution]]] = []
        for drink in catalog.drinks:
            if not orderable(drink, request.sold_out_drink_ids):
                continue
            score, factors = score_drink(profile, drink, request.preference_overrides)
            ranked.append((drink, score, factors))
        ranked.sort(key=lambda item: (-item[1], item[0].id))
        return ranked


def _rationale(drink_name: str, score: float, factors: list[FactorContribution]) -> str:
    top = factors[:2]
    bits = ", ".join(
        f"{factor.factor.replace('_', ' ')} ({factor.weight:+.2f})" for factor in top
    )
    if bits:
        return f"{drink_name} scores {score:.2f}. Strongest factors: {bits}."
    return f"{drink_name} scores {score:.2f}."
