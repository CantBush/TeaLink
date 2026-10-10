"""Transport seam: local is the default, and a down bus never calls NATS."""

import asyncio

from tealink.agents.preference_agent import PreferenceAgent
from tealink.agents.roster import default_agents
from tealink.bus import control_body, heartbeat_body, parse_body
from tealink.concierge.transport import AgntcyTransport, LocalTransport, _event_texts
from tealink.data.loader import load_catalog, load_choices
from tealink.data.seed import write_dataset
from tealink.schemas import DeliberationRequest


def test_bus_payloads_round_trip():
    beat = parse_body(heartbeat_body("taste"))
    control = parse_body(control_body("join", "shop_lantern_leaf"))
    assert beat == {"agent_id": "taste"}
    assert control == {"action": "join", "agent_id": "shop_lantern_leaf"}
    assert parse_body(b"not-json") is None


def test_unconnected_agntcy_uses_the_in_process_agent():
    write_dataset()
    catalog = load_catalog()
    agents = {agent.card().id: agent for agent in default_agents(catalog)}
    local = LocalTransport(agents, catalog)
    remote = AgntcyTransport("nats://127.0.0.1:1", fallback=local, timeout=0.2)

    reply = asyncio.run(
        remote.send(
            agents["taste"].card(),
            DeliberationRequest(round="propose", user_id="andrew", query="next"),
        )
    )

    assert reply.proposals
    assert remote.remote_replies.get("taste", 0) == 0
    assert remote.local_replies["taste"] == 1
    assert not remote.connected


def test_event_texts_reads_a_message_part():
    class _Root:
        text = '{"agent_id":"taste"}'

    class _Part:
        root = _Root()

    class _Message:
        parts = [_Part()]

    assert _event_texts(_Message()) == ['{"agent_id":"taste"}']
    assert _event_texts((_Message(), None)) == ['{"agent_id":"taste"}']


def test_preference_reset_drops_live_picks():
    write_dataset()
    agent = PreferenceAgent(load_choices())
    seeded = agent.report("andrew").choices_seen
    assert seeded > 0
    agent.history["andrew"].append(agent.history["andrew"][0])
    assert agent.report("andrew").choices_seen == seeded + 1
    agent.reset()
    assert agent.report("andrew").choices_seen == seeded
