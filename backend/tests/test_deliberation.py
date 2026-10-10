"""End-to-end deliberation through the API: disagreement, top 3, learning, and adaptation."""

import json

from fastapi.testclient import TestClient

from tealink.api.main import app
from tealink.data.seed import write_dataset


def _recommend(client: TestClient) -> tuple[list[dict], dict]:
    events = []
    with client.stream("POST", "/recommend", json={"user_id": "andrew"}) as response:
        for line in response.iter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:]))
    decision = next(event["payload"] for event in events if event["type"] == "decision")
    return events, decision


def test_demo_flow():
    write_dataset()
    client = TestClient(app)
    client.post("/events/reset")

    events, decision = _recommend(client)
    assert len(decision["options"]) == 3
    assert any(event["type"] == "preference" for event in events)
    kinds = {
        item["kind"]
        for event in events
        if event["type"] == "objection"
        for item in event["payload"].get("objections", [])
    }
    assert "concern" in kinds and "support" in kinds
    assert any(item["drink_id"] == "ll_brown_sugar_hojicha" for item in decision["dropped"])

    pick = decision["options"][2]["drink_id"]
    learned = client.post("/choices", json={"user_id": "andrew", "drink_id": pick}).json()
    assert learned["previous_weights"] != learned["weights"]
    assert client.post("/choices", json={"user_id": "andrew", "drink_id": "nope"}).status_code == 409

    winner = decision["drink_id"]
    client.post("/events/sold-out", json={"drink_id": winner})
    events, decision = _recommend(client)
    assert winner not in [item["drink_id"] for item in decision["options"]]
    assert any(event["payload"].get("kind") == "veto" for event in events if event["type"] == "objection")

    client.post("/events/shop-join", json={"shop_id": "lantern_leaf"})
    _events, decision = _recommend(client)
    assert decision["drink_id"] == "ll_brown_sugar_hojicha"

    client.post("/events/preference", json={"user_id": "andrew", "preference_overrides": {"brown_sugar": 0}})
    _events, decision = _recommend(client)
    assert decision["drink_id"] != "ll_brown_sugar_hojicha"

    client.post("/events/shop-offline", json={"shop_id": "sunright"})
    _events, decision = _recommend(client)
    assert all(item["shop_id"] != "sunright" for item in decision["options"])

    client.post("/events/reset")
