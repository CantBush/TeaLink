"""Opt-in check that a Taste agent answers over NATS.

``make test`` skips this. Run it with NATS up:

    cd backend && .venv/bin/pytest -m nats
"""

from __future__ import annotations

import asyncio
import json
import os
import socket
import subprocess
import sys
import time

import pytest

from tealink.agents.roster import default_agents
from tealink.agents.taste_agent import TasteAgent
from tealink.api.main import app
from tealink.concierge.transport import AgntcyTransport, LocalTransport
from tealink.data.loader import load_catalog
from tealink.data.seed import write_dataset
from tealink.schemas import DeliberationRequest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NATS_URL = "nats://127.0.0.1:4222"


def _nats_up() -> bool:
    sock = socket.socket()
    sock.settimeout(0.3)
    try:
        sock.connect(("127.0.0.1", 4222))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def _serve(*args: str) -> subprocess.Popen:
    return subprocess.Popen(
        [sys.executable, "-m", "tealink.agents.serve", *args],
        cwd=BACKEND,
        start_new_session=True,
    )


def _stop(process: subprocess.Popen) -> None:
    if process.poll() is None:
        try:
            os.killpg(process.pid, 15)
        except ProcessLookupError:
            process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


@pytest.mark.nats
def test_taste_answers_over_nats():
    if not _nats_up():
        pytest.skip("NATS is not running on port 4222")
    write_dataset()
    process = _serve("--agent", "taste")
    try:
        catalog = load_catalog()
        taste = TasteAgent()
        local = LocalTransport({"taste": taste}, catalog)
        remote = AgntcyTransport(NATS_URL, fallback=local, timeout=8, reconcile_wait=0.2)

        async def run():
            assert await remote.connect(), remote.failure
            await remote.listen(lambda agent_id: remote.note(agent_id))
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline and not remote.recent("taste", window=5):
                await asyncio.sleep(0.25)
            assert remote.recent("taste", window=5), "taste never heartbeated"
            reply = await remote.send(
                taste.card(),
                DeliberationRequest(round="propose", user_id="andrew", query="What should I get next?"),
            )
            assert reply.agent_id == "taste"
            assert reply.proposals
            assert remote.remote_replies.get("taste", 0) >= 1

        asyncio.run(run())
    finally:
        _stop(process)


@pytest.mark.nats
def test_recommend_uses_remote_taste():
    if not _nats_up():
        pytest.skip("NATS is not running on port 4222")
    """One /recommend with TRANSPORT=agntcy gets a Taste reply over NATS.

    The other agents are not running, so they stay on the in-process fallback.
    That is the seam: the HTTP response is still a full deliberation.
    """
    write_dataset()
    process = _serve("--agent", "taste")
    try:
        from fastapi.testclient import TestClient

        app.state.runtime = None
        os.environ["TRANSPORT"] = "agntcy"
        os.environ["NATS_URL"] = NATS_URL
        try:
            client = TestClient(app)
            with client.stream("POST", "/recommend", json={"user_id": "andrew"}) as response:
                events = []
                for line in response.iter_lines():
                    if line.startswith("data:"):
                        events.append(json.loads(line[5:]))
            decision = next(event["payload"] for event in events if event["type"] == "decision")
            assert len(decision["options"]) == 3
            health = client.get("/health").json()
            assert health["effective"] == "agntcy"
            assert health["remote_replies"].get("taste", 0) >= 1
            # Taste proposed over the bus; the rest of the team still answered.
            assert any(event["agent_id"] == "taste" and event["type"] == "proposal" for event in events)
        finally:
            os.environ["TRANSPORT"] = "local"
            app.state.runtime = None
    finally:
        _stop(process)


def test_roster_is_importable_for_launch():
    """Launch starts one process per default agent plus standby shops."""
    write_dataset()
    catalog = load_catalog()
    online = [agent.card().id for agent in default_agents(catalog)]
    assert "taste" in online
    assert "shop_lantern_leaf" not in online
