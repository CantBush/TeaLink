"""GET /eval serves the precomputed comparison, and Sarah is Andrew's top match."""

from fastapi.testclient import TestClient

from tealink.api.main import app
from tealink.data.seed import write_dataset
from tealink.schemas import DIMENSIONS

METHODS = ("popularity", "fixed_weights", "learning")
PERSONAS = ("Price hunter", "Explorer", "Loyalist")


def test_eval_endpoint_matches_the_contract():
    client = TestClient(app)
    response = client.get("/eval")
    assert response.status_code == 200
    body = response.json()
    assert body["rounds"] >= 1
    assert [method["method"] for method in body["methods"]] == list(METHODS)
    for method in body["methods"]:
        assert 0.0 <= method["hit_rate"] <= 1.0
        assert 0.0 <= method["top3_rate"] <= 1.0
        assert 0.0 <= method["repeat_rate"] <= 1.0
        assert method["sold_out_recs"] >= 0
    assert [persona["name"] for persona in body["personas"]] == list(PERSONAS)
    for persona in body["personas"]:
        for key in ("hidden_weights", "learned_weights"):
            assert set(persona[key]) == set(DIMENSIONS)
            assert abs(sum(persona[key].values()) - 1.0) < 1e-6


def test_similar_users_returns_sarah_first():
    write_dataset()
    app.state.runtime = None
    client = TestClient(app)
    response = client.get("/users/similar", params={"user_id": "andrew"})
    assert response.status_code == 200
    users = response.json()["users"]
    assert users[0]["id"] == "sarah"
    assert users[0]["name"] == "Sarah"
