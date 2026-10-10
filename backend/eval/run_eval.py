"""Does the team find what a user actually wants, and does learning help?

Simulated users with hidden priorities (price hunter, explorer, loyalist) each
have a true favorite every round: the in-stock drink with the best score under
those hidden weights. Three recommenders name a top 3:

- popularity: most-reviewed drink this user has not tried
- fixed weights: the agent team, stuck on the default priorities
- learning: the same team, updating after every pick

A hit means the recommender's #1 is that favorite. Top-3 rate means the
favorite appears anywhere in the three. The user can only pick inside the
learning team's top 3, and that pick is what the Preference agent learns from.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass, field
from pathlib import Path

from tealink.agents.preference_agent import PreferenceAgent
from tealink.agents.roster import default_agents
from tealink.concierge.deliberation import deliberate
from tealink.concierge.registry import Registry
from tealink.concierge.transport import LocalTransport
from tealink.core import objectives
from tealink.core.baseline import popularity_ranking
from tealink.core.preferences import combined_score
from tealink.data.loader import Catalog, load_catalog
from tealink.schemas import DIMENSIONS, ChoiceRecord, Decision, Drink, LensEventType

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "eval_results.json"
USER_ID = "andrew"
METHODS = ("popularity", "fixed_weights", "learning")

PERSONAS: dict[str, dict[str, float]] = {
    "Price hunter": {"taste": 0.30, "social": 0.10, "novelty": 0.05, "cost": 0.55},
    "Explorer": {"taste": 0.30, "social": 0.10, "novelty": 0.50, "cost": 0.10},
    "Loyalist": {"taste": 0.70, "social": 0.20, "novelty": 0.05, "cost": 0.05},
}


@dataclass
class Tally:
    rounds: int = 0
    hits: int = 0
    top3: int = 0
    sold_out_recs: int = 0
    repeats: int = 0
    recommended: int = 0


@dataclass
class Team:
    registry: Registry
    transport: LocalTransport
    preference: PreferenceAgent


@dataclass
class Report:
    rounds: int
    methods: dict[str, Tally] = field(default_factory=dict)
    personas: list[dict] = field(default_factory=list)


def _team(catalog: Catalog) -> Team:
    agents = default_agents(catalog, history=[])
    registry = Registry()
    for agent in agents:
        registry.register(agent.card())
    transport = LocalTransport({agent.card().id: agent for agent in agents}, catalog)
    preference = next(agent for agent in agents if isinstance(agent, PreferenceAgent))
    return Team(registry=registry, transport=transport, preference=preference)


def _wake(registry: Registry) -> None:
    for card in registry.list():
        registry.heartbeat(card.id)


def _pool(catalog: Catalog, online_shop_ids: set[str], ordered: set[str]) -> list[Drink]:
    return [
        drink
        for drink in catalog.drinks
        if drink.available and drink.shop_id in online_shop_ids and drink.id not in ordered
    ]


def _dimension_scores(catalog: Catalog, drink: Drink, near: list[tuple[str, float]]) -> dict[str, float]:
    taste, _factors = objectives.taste(catalog, USER_ID, drink, None)
    social, _social_reason = objectives.social(catalog, drink, near)
    novelty, _novelty_reason = objectives.novelty(catalog, USER_ID, drink)
    cost, _cost_reason = objectives.cost(catalog, drink)
    return {"taste": taste, "social": social, "novelty": novelty, "cost": cost}


def _note(
    tally: Tally,
    recommended: list[str],
    favorite_id: str,
    tried: set[str],
    sold_out: set[str],
) -> None:
    tally.rounds += 1
    if recommended and recommended[0] == favorite_id:
        tally.hits += 1
    if favorite_id in recommended:
        tally.top3 += 1
    for drink_id in recommended:
        tally.recommended += 1
        if drink_id in tried:
            tally.repeats += 1
        if drink_id in sold_out:
            tally.sold_out_recs += 1


async def _decide(team: Team, sold_out: list[str]) -> Decision:
    _wake(team.registry)
    decision = None
    async for event in deliberate(
        registry=team.registry,
        transport=team.transport,
        user_id=USER_ID,
        query="What should I get next?",
        sold_out_drink_ids=sold_out,
    ):
        if event.type == LensEventType.decision:
            decision = Decision.model_validate(event.payload)
    if decision is None:
        raise RuntimeError("deliberation produced no decision")
    return decision


def _rate(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return round(numerator / denominator, 6)


def _weights(weights: dict[str, float]) -> dict[str, float]:
    return {dim: round(float(weights[dim]), 6) for dim in DIMENSIONS}


async def evaluate(rounds: int, catalog: Catalog | None = None) -> dict:
    catalog = catalog or load_catalog()
    tried = {review.drink_id for review in catalog.reviews_for(USER_ID)}
    online = {shop.id for shop in catalog.shops if shop.online}
    near = objectives.neighbors(catalog, USER_ID)
    tallies = {method: Tally() for method in METHODS}
    personas: list[dict] = []

    for name, hidden in PERSONAS.items():
        fixed = _team(catalog)
        learning = _team(catalog)
        ordered: list[str] = []
        for _ in range(rounds):
            pool = _pool(catalog, online, set(ordered))
            if not pool:
                break
            scores = {drink.id: _dimension_scores(catalog, drink, near) for drink in pool}
            favorite = max(pool, key=lambda drink: (combined_score(hidden, scores[drink.id]), drink.id))
            sold_out = set(ordered)
            sold_list = list(ordered)

            popular = popularity_ranking(
                catalog.reviews,
                pool,
                user_id=USER_ID,
                online_shop_ids=online,
                sold_out_ids=sold_out,
            )
            _note(tallies["popularity"], [item.drink_id for item in popular], favorite.id, tried, sold_out)

            fixed_decision = await _decide(fixed, sold_list)
            _note(
                tallies["fixed_weights"],
                [item.drink_id for item in fixed_decision.options],
                favorite.id,
                tried,
                sold_out,
            )

            learning_decision = await _decide(learning, sold_list)
            _note(
                tallies["learning"],
                [item.drink_id for item in learning_decision.options],
                favorite.id,
                tried,
                sold_out,
            )
            if learning_decision.options:
                picked = max(
                    learning_decision.options,
                    key=lambda option: (combined_score(hidden, option.dimension_scores), option.drink_id),
                )
                learning.preference.learn(
                    ChoiceRecord(
                        user_id=USER_ID,
                        chosen_drink_id=picked.drink_id,
                        options=learning_decision.options,
                    )
                )
            ordered.append(favorite.id)

        personas.append(
            {
                "name": name,
                "hidden_weights": {dim: hidden[dim] for dim in DIMENSIONS},
                "learned_weights": _weights(learning.preference.weights(USER_ID)),
            }
        )

    completed = tallies["popularity"].rounds // len(PERSONAS)
    return {
        "rounds": completed,
        "methods": [
            {
                "method": method,
                "hit_rate": _rate(tallies[method].hits, tallies[method].rounds),
                "top3_rate": _rate(tallies[method].top3, tallies[method].rounds),
                "sold_out_recs": tallies[method].sold_out_recs,
                "repeat_rate": _rate(tallies[method].repeats, tallies[method].recommended),
            }
            for method in METHODS
        ],
        "personas": personas,
    }


def write_results(payload: dict, path: Path | None = None) -> Path:
    target = path or DATA_PATH
    target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return target


def _print(payload: dict) -> None:
    print(
        f"{payload['rounds']} rounds per user. "
        "Hit = the recommender's #1 was the user's favorite drink.\n"
    )
    print(f"{'method':16} {'#1 hit':>8} {'in top 3':>8} {'sold out':>8} {'already tried':>13}")
    for method in payload["methods"]:
        print(
            f"{method['method']:16} {method['hit_rate']:8.3f} {method['top3_rate']:8.3f} "
            f"{method['sold_out_recs']:8d} {method['repeat_rate']:13.3f}"
        )
    print()
    for persona in payload["personas"]:
        learned = ", ".join(
            f"{dim} {round(persona['learned_weights'][dim] * 100)}%" for dim in DIMENSIONS
        )
        hidden = ", ".join(
            f"{dim} {round(persona['hidden_weights'][dim] * 100)}%" for dim in DIMENSIONS
        )
        print(f"{persona['name']:14} learned  {learned}")
        print(f"{'':14} hidden   {hidden}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Popularity vs fixed weights vs learning")
    parser.add_argument("--rounds", type=int, default=8)
    parser.add_argument("--output", type=Path, default=DATA_PATH)
    args = parser.parse_args(argv)
    payload = asyncio.run(evaluate(args.rounds))
    path = write_results(payload, args.output)
    _print(payload)
    print(f"\nWrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
