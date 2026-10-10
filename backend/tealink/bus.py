"""NATS subjects that are not part of the HTTP API.

The frontend never sees these. Deliberation still travels as A2A on
``tealink.<agent id>`` (see ``agents.cards``). Heartbeats and demo control
(shop join, shop offline, reset) use the two subjects below so the gateway
can keep the registry honest without a schema change.
"""

from __future__ import annotations

import json

HEARTBEAT_SUBJECT = "tealink.heartbeat"
CONTROL_SUBJECT = "tealink.control"
HEARTBEAT_INTERVAL_SECONDS = 0.5


def heartbeat_body(agent_id: str) -> bytes:
    return json.dumps({"agent_id": agent_id}).encode()


def control_body(action: str, agent_id: str) -> bytes:
    return json.dumps({"action": action, "agent_id": agent_id}).encode()


def parse_body(raw: bytes) -> dict | None:
    try:
        payload = json.loads(raw.decode())
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    return payload
