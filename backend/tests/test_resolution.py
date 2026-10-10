"""Resolver ranks by learned weights, drops vetoed and unconfirmed drinks, and returns a top 3."""

from tealink.agents.shop_agent import ShopAgent
from tealink.core.resolution import resolve
from tealink.data.loader import load_catalog
from tealink.data.seed import write_dataset
from tealink.schemas import DeliberationRequest, Objection, ObjectionKind, Proposal

TASTE_ONLY = {"taste": 1.0, "social": 0.0, "novelty": 0.0, "cost": 0.0}


def _proposal(drink_id: str, score: float, dimension: str = "taste", shop_id: str = "kungfu") -> Proposal:
    return Proposal(
        agent_id={"taste": "taste", "cost": "budget", "novelty": "explorer", "social": "social"}[dimension],
        drink_id=drink_id,
        drink_name=drink_id,
        shop_id=shop_id,
        score=score,
        factors=[],
        evidence=[],
        rationale="because",
        dimension=dimension,
    )


def _rating(agent_id: str, drink_id: str, dimension: str, score: float) -> Objection:
    return Objection(
        agent_id=agent_id,
        target_drink_id=drink_id,
        kind=ObjectionKind.support,
        reason="rated",
        score=score,
        dimension=dimension,
    )


def test_veto_removes_the_higher_score():
    decision = resolve(
        [_proposal("sold-out", 0.91), _proposal("kept", 0.70)],
        [Objection(agent_id="shop_kungfu", target_drink_id="sold-out", kind=ObjectionKind.veto, reason="sold out")],
        weights=TASTE_ONLY,
    )
    assert decision.drink_id == "kept"
    assert [item.drink_id for item in decision.dropped] == ["sold-out"]
    assert decision.dropped[0].by == "shop_kungfu"
    assert "sold-out" in decision.explanation


def test_weights_decide_between_taste_and_cost():
    proposals = [_proposal("tasty", 0.95), _proposal("cheap", 0.9, "cost")]
    ratings = [
        _rating("taste", "cheap", "taste", 0.70),
        _rating("budget", "tasty", "cost", 0.10),
    ]
    by_taste = resolve(proposals, ratings, weights={"taste": 0.8, "social": 0.05, "novelty": 0.05, "cost": 0.1})
    by_cost = resolve(proposals, ratings, weights={"taste": 0.3, "social": 0.05, "novelty": 0.05, "cost": 0.6})
    assert by_taste.drink_id == "tasty"
    assert by_cost.drink_id == "cheap"
    assert by_cost.options[0].dimension_scores["cost"] == 0.9


def test_top_three_options_and_near_tie_asks_human():
    proposals = [_proposal(name, score) for name, score in (("a", 0.80), ("b", 0.79), ("c", 0.60), ("d", 0.40))]
    decision = resolve(proposals, [], weights=TASTE_ONLY)
    assert [item.drink_id for item in decision.options] == ["a", "b", "c"]
    assert decision.ask_human is True
    assert decision.question and "nearly tied" in decision.question


def test_clear_winner_does_not_ask():
    decision = resolve([_proposal("first", 0.90), _proposal("second", 0.70)], [], weights=TASTE_ONLY)
    assert decision.ask_human is False
    assert decision.question is None


def test_unconfirmed_shop_is_dropped():
    decision = resolve(
        [_proposal("ok", 0.6, shop_id="kungfu"), _proposal("ghost", 0.9, shop_id="lantern_leaf")],
        [],
        weights=TASTE_ONLY,
        confirmed_shop_ids={"kungfu"},
    )
    assert decision.drink_id == "ok"
    assert decision.dropped[0].drink_id == "ghost"
    assert decision.dropped[0].by == "registry"


def test_everything_vetoed_asks_human():
    decision = resolve(
        [_proposal("only", 0.9)],
        [Objection(agent_id="shop_kungfu", target_drink_id="only", kind=ObjectionKind.veto, reason="sold out")],
    )
    assert decision.drink_id == ""
    assert decision.ask_human is True
    assert decision.options == []


def test_shop_agent_vetoes_sold_out_and_confirms_stock():
    write_dataset()
    catalog = load_catalog()
    request = DeliberationRequest(
        round="object",
        user_id="andrew",
        query="",
        candidate_drink_ids=["kf_brown_sugar_oolong", "kf_thai", "sr_pearl_milk"],
        sold_out_drink_ids=["kf_brown_sugar_oolong"],
    )
    reply = ShopAgent("kungfu", "Kung Fu Tea Co.").handle(request, catalog)
    kinds = {item.target_drink_id: item.kind for item in reply.objections}
    assert kinds == {"kf_brown_sugar_oolong": ObjectionKind.veto, "kf_thai": ObjectionKind.support}
    propose = DeliberationRequest(round="propose", user_id="andrew", query="")
    assert ShopAgent("kungfu").handle(propose, catalog).proposals == []
