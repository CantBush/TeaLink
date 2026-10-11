"""Dialogue rebuttals, and the round-2 fields the team grid and Discover read."""

import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from tealink.agents.budget_agent import BudgetAgent
from tealink.agents.cards import AgentCardInfo
from tealink.agents.objective_agent import SUPPORT_AT, soften_objection
from tealink.agents.preference_agent import PreferenceAgent
from tealink.agents.roster import default_agents
from tealink.agents.shop_agent import ShopAgent
from tealink.api.main import app
from tealink.concierge.deliberation import deliberate
from tealink.concierge.registry import Registry
from tealink.concierge.transport import AgntcyTransport, LocalTransport, ReviseTimeout
from tealink.data.loader import load_catalog
from tealink.data.seed import write_dataset
from tealink.schemas import (
    AgentReply,
    DeliberationRequest,
    Objection,
    ObjectionKind,
    Proposal,
    RevisedFrom,
)

VETO_REASON = "Thai Tea is sold out at Kung Fu Tea Co."


def _proposal(drink: str, score: float) -> Proposal:
    return Proposal(
        agent_id="taste",
        drink_id=drink,
        drink_name=drink,
        shop_id="kungfu",
        score=score,
        factors=[],
        evidence=[],
        rationale="because",
        price=5.0,
        dimension="taste",
    )


def _scored(agent: str, drink: str, kind: ObjectionKind, score: float, dimension: str) -> Objection:
    return Objection(
        agent_id=agent,
        target_drink_id=drink,
        kind=kind,
        reason=f"{drink} from {agent}",
        score=score,
        dimension=dimension,
    )


def _groups(thai_kind: ObjectionKind, thai_score: float) -> dict[str, list[Objection]]:
    return {
        "taste": [
            _scored("taste", "thai", ObjectionKind.support, 0.8, "taste"),
            _scored("taste", "pearl", ObjectionKind.support, 0.6, "taste"),
            _scored("taste", "sold", ObjectionKind.support, 0.4, "taste"),
        ],
        "budget": [
            _scored("budget", "thai", thai_kind, thai_score, "cost"),
            _scored("budget", "pearl", ObjectionKind.support, 0.75, "cost"),
            _scored("budget", "sold", ObjectionKind.concern, 0.25, "cost"),
        ],
        "shop_kungfu": [
            Objection(
                agent_id="shop_kungfu",
                target_drink_id="sold",
                kind=ObjectionKind.veto,
                reason=VETO_REASON,
            ),
            Objection(
                agent_id="shop_kungfu",
                target_drink_id="thai",
                kind=ObjectionKind.support,
                reason="Thai is in stock.",
            ),
            Objection(
                agent_id="shop_kungfu",
                target_drink_id="pearl",
                kind=ObjectionKind.support,
                reason="Pearl is in stock.",
            ),
        ],
    }


def _replies(groups: dict[str, list[Objection]]) -> list[AgentReply]:
    return [AgentReply(agent_id=agent_id, objections=items) for agent_id, items in groups.items()]


class Scripted:
    """Propose, one objection round, then whatever each revise step returns."""

    def __init__(self, steps: list[dict[str, list[Objection]] | str]) -> None:
        self.steps = steps
        self.revise_calls = 0
        self.peer_scores: list[float] = []
        self.proposals = [_proposal("thai", 0.8), _proposal("pearl", 0.6), _proposal("sold", 0.4)]

    async def broadcast(self, cards, msg: DeliberationRequest) -> list[AgentReply]:
        if msg.round == "propose":
            return [
                AgentReply(agent_id="taste", proposals=self.proposals),
                AgentReply(agent_id="budget"),
                AgentReply(agent_id="shop_kungfu"),
            ]
        if msg.round == "object":
            return _replies(_groups(ObjectionKind.concern, 0.25))
        if msg.round == "revise":
            step = self.steps[self.revise_calls]
            self.revise_calls += 1
            thai = next(
                item.score
                for item in msg.peer_objections
                if item.agent_id == "budget" and item.target_drink_id == "thai"
            )
            self.peer_scores.append(thai if thai is not None else -1.0)
            if step == "timeout":
                raise ReviseTimeout("budget")
            return _replies(step)
        return []

    async def send(self, card, msg: DeliberationRequest) -> AgentReply:
        return AgentReply(agent_id=card.id)


def _registry() -> Registry:
    registry = Registry()
    registry.register(
        AgentCardInfo(id="taste", name="Taste", description="Fits your reviews.", capabilities=["taste_profile"])
    )
    registry.register(
        AgentCardInfo(id="budget", name="Budget", description="Cheaper drinks that fit your taste.", capabilities=["cost"])
    )
    registry.register(
        AgentCardInfo(
            id="shop_kungfu",
            name="Kung Fu Tea Co. teagent",
            description="Confirms what is in stock.",
            capabilities=["availability"],
            shop_id="kungfu",
        )
    )
    return registry


def _run(monkeypatch, transport: Scripted) -> list[dict]:
    monkeypatch.setenv("DELIBERATION", "dialogue")

    async def collect() -> list[dict]:
        found = []
        async for event in deliberate(
            registry=_registry(),
            transport=transport,
            user_id="andrew",
            query="next",
        ):
            found.append(event.model_dump(mode="json"))
        return found

    return asyncio.run(collect())


def _decision(events: list[dict]) -> dict:
    return next(event["payload"] for event in events if event["type"] == "decision")


def _summaries(events: list[dict], event_round: int) -> list[dict]:
    return [
        event["payload"]
        for event in events
        if event["type"] == "objection"
        and event["payload"].get("round") == event_round
        and "objections" in event["payload"]
    ]


def _veto(events: list[dict], event_round: int) -> dict:
    found = [
        event["payload"]
        for event in events
        if event["type"] == "objection"
        and event["payload"].get("kind") == "veto"
        and "objections" not in event["payload"]
        and event["payload"].get("round") == event_round
    ]
    assert len(found) == 1
    return found[0]


def _without_round(payload: dict) -> dict:
    data = dict(payload)
    data.pop("round", None)
    return data


def test_soften_only_moves_halfway_and_one_direction():
    concern = Objection(
        agent_id="budget",
        target_drink_id="thai",
        kind=ObjectionKind.concern,
        reason="low",
        score=0.25,
        dimension="cost",
    )
    rose = soften_objection(concern, [0.25, 0.75, 1.0])
    assert rose.score == pytest.approx(0.5)
    assert rose.kind == ObjectionKind.neutral
    assert rose.revised_from == RevisedFrom(kind="concern", score=0.25)
    assert rose.reason == "low"

    held = soften_objection(concern, [0.0, 0.0, 0.0])
    assert held.score == pytest.approx(0.25)
    assert held.kind == ObjectionKind.concern
    assert held.revised_from is None

    support = concern.model_copy(update={"kind": ObjectionKind.support, "score": 0.75})
    assert soften_objection(support, [1.0, 1.0, 1.0]).revised_from is None
    eased = soften_objection(support.model_copy(update={"score": 1.0}), [0.5, 0.5, 0.5])
    assert eased.score == pytest.approx(0.75)
    assert eased.kind == ObjectionKind.support
    assert eased.revised_from == RevisedFrom(kind="support", score=1.0)

    floored = soften_objection(support.model_copy(update={"score": 1.0}), [0.0, 0.0, 0.0])
    assert floored.score == pytest.approx(SUPPORT_AT)
    assert floored.kind == ObjectionKind.support
    assert floored.revised_from is not None

    neutral = concern.model_copy(update={"kind": ObjectionKind.neutral, "score": 0.5})
    opened = soften_objection(neutral, [1.0, 1.0, 1.0])
    assert opened.score == pytest.approx(0.75)
    assert opened.kind == ObjectionKind.support
    assert opened.revised_from == RevisedFrom(kind="neutral", score=0.5)

    assert soften_objection(concern, []).revised_from is None
    veto = Objection(agent_id="shop_kungfu", target_drink_id="sold", kind=ObjectionKind.veto, reason=VETO_REASON)
    copied = soften_objection(veto, [1.0])
    assert copied.kind == ObjectionKind.veto and copied.revised_from is None and copied.reason == VETO_REASON


def test_shop_echoes_and_a_veto_is_never_revised():
    write_dataset()
    catalog = load_catalog()
    veto = Objection(agent_id="shop_kungfu", target_drink_id="kf_thai", kind=ObjectionKind.veto, reason=VETO_REASON)
    support = Objection(
        agent_id="shop_kungfu",
        target_drink_id="kf_pearl",
        kind=ObjectionKind.support,
        reason="Pearl is in stock.",
        revised_from=RevisedFrom(kind="concern", score=0.25),
    )
    other = _scored("taste", "kf_thai", ObjectionKind.support, 0.8, "taste")
    reply = ShopAgent("kungfu", "Kung Fu Tea Co.").handle(
        DeliberationRequest(
            round="revise",
            user_id="andrew",
            query="",
            candidate_drink_ids=["kf_thai", "kf_pearl"],
            peer_objections=[other, veto, support],
        ),
        catalog,
    )
    assert [item.target_drink_id for item in reply.objections] == ["kf_thai", "kf_pearl"]
    assert reply.objections[0].reason == VETO_REASON
    assert all(item.agent_id == "shop_kungfu" and item.revised_from is None for item in reply.objections)


def test_preference_ignores_revise_and_budget_softens():
    write_dataset()
    catalog = load_catalog()
    preference = PreferenceAgent([]).handle(
        DeliberationRequest(round="revise", user_id="andrew", query="", peer_objections=[_scored("taste", "x", ObjectionKind.support, 0.8, "taste")]),
        catalog,
    )
    assert preference.proposals == [] and preference.objections == [] and preference.preference is None

    drink, other = catalog.drinks[0], catalog.drinks[1]
    own = _scored("budget", drink.id, ObjectionKind.concern, 0.25, "cost")
    peers = [
        _scored("taste", drink.id, ObjectionKind.support, 0.75, "taste"),
        _scored("social", drink.id, ObjectionKind.support, 0.75, "social"),
        _scored("explorer", drink.id, ObjectionKind.neutral, 0.5, "novelty"),
    ]
    reply = BudgetAgent().handle(
        DeliberationRequest(
            round="revise",
            user_id="andrew",
            query="",
            candidate_drink_ids=[drink.id, other.id],
            peer_objections=[own, *peers],
        ),
        catalog,
    )
    moved = next(item for item in reply.objections if item.target_drink_id == drink.id)
    fresh = next(item for item in reply.objections if item.target_drink_id == other.id)
    assert moved.score == pytest.approx(0.5)
    assert moved.kind == ObjectionKind.neutral
    assert moved.revised_from == RevisedFrom(kind="concern", score=0.25)
    assert moved.reason == own.reason
    assert fresh.revised_from is None and fresh.dimension == "cost"


def test_dialogue_stops_when_a_rebuttal_changes_nothing(monkeypatch):
    soft = _groups(ObjectionKind.neutral, 0.5)
    transport = Scripted([soft, soft])
    events = _run(monkeypatch, transport)
    decision = _decision(events)

    assert decision["decided_by"] == "agents"
    assert decision["rounds"] == 2
    assert transport.revise_calls == 2
    assert transport.peer_scores == [0.25, 0.5]
    assert {event["payload"]["round"] for event in events if event["type"] == "proposal"} == {0}
    assert {event["payload"]["round"] for event in events if event["type"] == "objection"} == {1, 2, 3}

    budget = next(item for item in _summaries(events, 2) if item["agent_id"] == "budget")
    thai = next(item for item in budget["objections"] if item["target_drink_id"] == "thai")
    pearl = next(item for item in budget["objections"] if item["target_drink_id"] == "pearl")
    assert thai["revised_from"] == {"kind": "concern", "score": 0.25}
    assert budget["revised_from"] == {"kind": "concern", "score": 0.25}
    assert "revised_from" not in pearl
    later = next(item for item in _summaries(events, 3) if item["agent_id"] == "budget")
    assert "revised_from" not in later
    assert all("revised_from" not in item for item in later["objections"])

    assert _without_round(_veto(events, 2)) == _without_round(_veto(events, 1))
    assert _without_round(_veto(events, 3)) == _without_round(_veto(events, 1))
    assert "revised_from" not in _veto(events, 1)
    assert _veto(events, 1)["reason"] == VETO_REASON


def test_third_unchanged_rebuttal_is_still_the_agents(monkeypatch):
    first = _groups(ObjectionKind.neutral, 0.5)
    second = _groups(ObjectionKind.support, 0.75)
    transport = Scripted([first, second, second])
    events = _run(monkeypatch, transport)
    decision = _decision(events)
    assert decision["decided_by"] == "agents" and decision["rounds"] == 3
    assert transport.revise_calls == 3
    assert 4 in {event["payload"]["round"] for event in events if event["type"] == "objection"}


def test_three_revising_rounds_go_to_the_arbiter(monkeypatch):
    transport = Scripted(
        [
            _groups(ObjectionKind.neutral, 0.5),
            _groups(ObjectionKind.neutral, 0.5 + 0.0625),
            _groups(ObjectionKind.support, 0.75),
        ]
    )
    events = _run(monkeypatch, transport)
    decision = _decision(events)
    assert decision["decided_by"] == "arbiter" and decision["rounds"] == 3
    assert transport.revise_calls == 3
    assert {event["payload"]["round"] for event in events if event["type"] == "objection"} == {1, 2, 3, 4}


def test_revise_timeout_keeps_the_last_complete_scores(monkeypatch):
    transport = Scripted([_groups(ObjectionKind.neutral, 0.5), "timeout"])
    events = _run(monkeypatch, transport)
    decision = _decision(events)
    thai = next(item for item in decision["options"] if item["drink_id"] == "thai")
    assert decision["decided_by"] == "arbiter" and decision["rounds"] == 1
    assert thai["dimension_scores"]["cost"] == pytest.approx(0.5)
    assert transport.revise_calls == 2
    assert {event["payload"]["round"] for event in events if event["type"] == "objection"} == {1, 2}


def test_revise_timeout_does_not_answer_in_process():
    write_dataset()
    catalog = load_catalog()
    agents = {agent.card().id: agent for agent in default_agents(catalog)}
    remote = AgntcyTransport("nats://127.0.0.1:1", fallback=LocalTransport(agents, catalog), timeout=0.2)
    remote.connected = True

    async def fail(card, msg):
        raise TimeoutError("nats")

    remote._remote = fail
    card = agents["taste"].card()

    async def run():
        with pytest.raises(ReviseTimeout):
            await remote.broadcast([card], DeliberationRequest(round="revise", user_id="andrew", query=""))
        assert remote.local_replies.get("taste", 0) == 0
        remote._local_only.clear()
        reply = await remote.send(card, DeliberationRequest(round="propose", user_id="andrew", query="next"))
        assert reply.proposals
        assert remote.local_replies["taste"] == 1

    asyncio.run(run())


def _recommend(client: TestClient) -> tuple[list[dict], dict]:
    events = []
    with client.stream("POST", "/recommend", json={"user_id": "andrew"}) as response:
        for line in response.iter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:]))
    decision = next(event["payload"] for event in events if event["type"] == "decision")
    return events, decision


def test_single_mode_keeps_the_scripted_opening(monkeypatch):
    monkeypatch.setenv("DELIBERATION", "single")
    write_dataset()
    app.state.runtime = None
    client = TestClient(app)
    client.post("/events/reset")
    events, decision = _recommend(client)

    assert [round(item["score"] * 100) for item in decision["options"]] == [78, 77, 71]
    assert decision["rounds"] == 0 and decision["decided_by"] == "arbiter"
    assert {event["payload"]["round"] for event in events if event["type"] == "proposal"} == {0}
    assert {event["payload"]["round"] for event in events if event["type"] == "objection"} == {1}
    assert not any(
        event["payload"].get("revised_from")
        or any(item.get("revised_from") for item in event["payload"].get("objections", []))
        for event in events
    )

    runtime = app.state.runtime
    reasons = []
    for event in events:
        if event["type"] == "selection":
            payload = event["payload"]
            card = runtime.registry.get(event["agent_id"])
            assert card is not None
            assert payload["name"] == card.name and payload["description"] == card.description
            text = f"{payload['name']} {payload['description']} {payload['reason']}".casefold()
            assert "the user" not in text and "this user" not in text
        if event["type"] == "objection":
            payload = event["payload"]
            reasons.extend(item.get("reason", "") for item in payload.get("objections", []))
            if "objections" not in payload:
                reasons.append(payload.get("reason", ""))
    assert any("Sarah" in reason and "rated it" in reason for reason in reasons)


def test_health_reports_deliberation(monkeypatch):
    client = TestClient(app)
    monkeypatch.setenv("DELIBERATION", "dialogue")
    assert client.get("/health").json()["deliberation"] == "dialogue"
    monkeypatch.setenv("DELIBERATION", "single")
    body = client.get("/health").json()
    assert body["status"] == "ok" and body["deliberation"] == "single"
    monkeypatch.setenv("DELIBERATION", "both")
    assert client.get("/health").json()["deliberation"] == "single"


def test_drink_and_shop_match_follow_the_user():
    write_dataset()
    app.state.runtime = None
    client = TestClient(app)
    client.post("/events/reset")

    drinks = client.get("/drinks").json()
    shops = client.get("/shops").json()
    assert all(item["match"] is None for item in drinks)
    assert all(item["match"] is None for item in shops)
    assert client.get("/drinks", params={"user": "nobody"}).status_code == 404
    assert client.get("/shops", params={"user": "nobody"}).status_code == 404

    matched = client.get("/drinks", params={"user": "andrew"}).json()
    shop_matched = client.get("/shops", params={"user": "andrew"}).json()
    assert [item["id"] for item in drinks] == [item["id"] for item in matched]
    assert [item["id"] for item in shops] == [item["id"] for item in shop_matched]
    assert all(isinstance(item["match"], float) and 0.0 <= item["match"] <= 1.0 for item in matched)
    by_shop: dict[str, list[float]] = {}
    for drink in matched:
        by_shop.setdefault(drink["shop_id"], []).append(drink["match"])
    for shop in shop_matched:
        assert shop["match"] == max(by_shop[shop["id"]])

    tagged = next(item for item in matched if "brown_sugar" in item["flavor_tags"])
    plain = next(
        item
        for item in matched
        if "brown_sugar" not in item["flavor_tags"] and item["shop_id"] == tagged["shop_id"]
    )
    client.post("/events/preference", json={"user_id": "andrew", "preference_overrides": {"brown_sugar": 0}})
    again = {item["id"]: item["match"] for item in client.get("/drinks", params={"user": "andrew"}).json()}
    assert again[tagged["id"]] < tagged["match"]
    assert again[plain["id"]] == plain["match"]


def test_card_color_is_hex_and_cleared_on_reset():
    write_dataset()
    app.state.runtime = None
    client = TestClient(app)
    client.post("/events/reset")
    assert client.get("/users/andrew").json()["card_color"] is None

    painted = client.patch("/users/andrew", json={"card_color": "#C4A574"}).json()
    assert painted["card_color"] == "#C4A574"
    assert client.get("/users/andrew").json()["card_color"] == "#C4A574"
    assert client.patch("/users/andrew", json={"card_color": "brown"}).status_code == 422
    assert client.get("/users/andrew").json()["card_color"] == "#C4A574"

    client.post("/events/reset")
    assert client.get("/users/andrew").json()["card_color"] is None
