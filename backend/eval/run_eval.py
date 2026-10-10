"""Does the Preference agent learn what a user cares about?

Simulated users with hidden priorities (price hunter, explorer, loyalist) take
turns picking from the top 3. Each round they pick the option that is best by
their hidden weights, and that drink is then off the table (they just had it).
We compare a team that learns from each pick against the same team with fixed
default weights, on how often the team's #1 was the drink the user picked.
"""

from __future__ import annotations

import argparse
import asyncio

from tealink.agents.preference_agent import PreferenceAgent
from tealink.agents.roster import default_agents
from tealink.concierge.deliberation import deliberate
from tealink.concierge.registry import Registry
from tealink.concierge.transport import LocalTransport
from tealink.core.preferences import PRIOR, combined_score
from tealink.data.loader import load_catalog
from tealink.schemas import DIMENSIONS, ChoiceRecord, Decision, LensEventType

PERSONAS: dict[str, dict[str, float]] = {
    "price hunter": {"taste": 0.30, "social": 0.10, "novelty": 0.05, "cost": 0.55},
    "explorer": {"taste": 0.30, "social": 0.10, "novelty": 0.50, "cost": 0.10},
    "loyalist": {"taste": 0.70, "social": 0.20, "novelty": 0.05, "cost": 0.05},
}


async def _decide(registry: Registry, transport: LocalTransport, skip: list[str]) -> Decision:
    decision = None
    async for event in deliberate(
        registry=registry,
        transport=transport,
        user_id="andrew",
        query="What should I get next?",
        sold_out_drink_ids=skip,
    ):
        if event.type == LensEventType.decision:
            decision = Decision.model_validate(event.payload)
    assert decision is not None
    return decision


async def simulate(hidden: dict[str, float], rounds: int, learn: bool) -> tuple[list[bool], dict[str, float]]:
    catalog = load_catalog()
    agents = default_agents(catalog, history=[])
    registry = Registry()
    for agent in agents:
        registry.register(agent.card())
    transport = LocalTransport({agent.card().id: agent for agent in agents}, catalog)
    preference = next(agent for agent in agents if isinstance(agent, PreferenceAgent))

    hits: list[bool] = []
    skip: list[str] = []
    for _ in range(rounds):
        decision = await _decide(registry, transport, skip)
        if not decision.options:
            break
        picked = max(decision.options, key=lambda option: (combined_score(hidden, option.dimension_scores), option.drink_id))
        hits.append(picked.drink_id == decision.drink_id)
        if learn:
            preference.learn(ChoiceRecord(user_id="andrew", chosen_drink_id=picked.drink_id, options=decision.options))
        skip.append(picked.drink_id)
    return hits, preference.weights("andrew")


def _rate(hits: list[bool]) -> str:
    return f"{sum(hits)}/{len(hits)}" if hits else "-"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Learning vs fixed weights on simulated users")
    parser.add_argument("--rounds", type=int, default=8)
    args = parser.parse_args(argv)

    half = args.rounds // 2
    print(f"{args.rounds} rounds per user. Hit = the team's #1 was the drink the user picked.\n")
    print(f"{'user':14} {'team':8} {'first half':>10} {'second half':>11} {'total':>7}   learned weights")
    totals = {"fixed": [], "learning": []}
    for name, hidden in PERSONAS.items():
        for label, learn in (("fixed", False), ("learning", True)):
            hits, weights = asyncio.run(simulate(hidden, args.rounds, learn))
            totals[label].extend(hits)
            shown = ", ".join(f"{dim} {round(weights[dim] * 100)}%" for dim in DIMENSIONS) if learn else ""
            print(f"{name:14} {label:8} {_rate(hits[:half]):>10} {_rate(hits[half:]):>11} {_rate(hits):>7}   {shown}")
        target = ", ".join(f"{dim} {round(hidden[dim] * 100)}%" for dim in DIMENSIONS)
        print(f"{'':14} {'hidden':8} {'':>10} {'':>11} {'':>7}   {target}")
    print(
        f"\nAll users: fixed {_rate(totals['fixed'])}, learning {_rate(totals['learning'])}. "
        f"Fixed weights are the default prior {PRIOR}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
