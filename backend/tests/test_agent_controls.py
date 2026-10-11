"""Demo-safe agent stop/start controls and per-round transport traces."""

import json

from fastapi.testclient import TestClient

from tealink.api.main import app
from tealink.agents.roster import default_agents
from tealink.concierge.transport import AgntcyTransport, LocalTransport
from tealink.data.loader import load_catalog
from tealink.data.seed import write_dataset
from tealink.schemas import DeliberationRequest


def _recommend(client: TestClient) -> list[dict]:
    events: list[dict] = []
    with client.stream("POST", "/recommend", json={"user_id": "andrew"}) as response:
        assert response.status_code == 200
        for line in response.iter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:]))
    return events


def test_stopping_budget_emits_a_loss_event_and_traces_the_remaining_team():
    write_dataset()
    app.state.runtime = None
    client = TestClient(app)
    client.post("/events/reset")

    stopped = client.post("/agents/budget/stop")
    assert stopped.status_code == 200 and stopped.json()["online"] is False

    events = _recommend(client)
    loss = next(event for event in events if event["type"] == "agent_lost")
    decision = next(event["payload"] for event in events if event["type"] == "decision")
    session_id = next(event["session_id"] for event in events if event["session_id"])

    assert loss["payload"] == {"agent_id": "budget", "reason": "stopped for this round", "when": "before_round"}
    assert decision["missing_agents"] == ["budget"]

    trace = client.get(f"/trace/{session_id}")
    assert trace.status_code == 200
    rows = trace.json()
    assert rows and {item["round"] for item in rows} == {0, 1}
    assert all(item["agent_id"] != "budget" and item["transport"] == "local" for item in rows)
    assert all(item["ms"] >= 0 and item["retries"] == 0 and item["fell_back"] is False for item in rows)

    started = client.post("/agents/budget/start")
    assert started.status_code == 200 and started.json()["online"] is True
    restored = _recommend(client)
    restored_decision = next(event["payload"] for event in restored if event["type"] == "decision")
    assert restored_decision["missing_agents"] == []


def test_agent_controls_and_traces_report_missing_resources():
    write_dataset()
    app.state.runtime = None
    client = TestClient(app)
    assert client.post("/agents/not-real/stop").status_code == 404
    assert client.get("/trace/not-real").status_code == 404


def test_unavailable_agntcy_route_records_a_local_fallback_trace():
    write_dataset()
    catalog = load_catalog()
    agents = {agent.card().id: agent for agent in default_agents(catalog)}
    transport = AgntcyTransport("nats://127.0.0.1:1", fallback=LocalTransport(agents, catalog))
    card = agents["taste"].card()

    import asyncio

    reply = asyncio.run(transport.send(card, DeliberationRequest(round="propose", user_id="andrew", query="next")))
    trace = transport.drain_traces()

    assert reply.proposals
    assert len(trace) == 1
    assert trace[0].agent_id == "taste"
    assert trace[0].transport == "local" and trace[0].fell_back is True
