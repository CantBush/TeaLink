"""Resolver drops vetoes and asks a human when the top two scores are close."""

from tealink.agents.shop_agent import ShopAgent
from tealink.core.resolution import resolve
from tealink.data.loader import load_catalog
from tealink.data.seed import write_dataset
from tealink.schemas import DeliberationRequest, Objection, ObjectionKind, Proposal


def _proposal(drink_id: str, score: float, agent_id: str = "taste") -> Proposal:
    return Proposal(
        agent_id=agent_id,
        drink_id=drink_id,
        drink_name=drink_id,
        shop_id="kungfu",
        score=score,
        factors=[],
        evidence=[],
        rationale="because",
    )


def test_veto_removes_the_higher_score():
    decision = resolve(
        [_proposal("sold-out", 0.91), _proposal("kept", 0.70)],
        [
            Objection(
                agent_id="shop_kungfu",
                target_drink_id="sold-out",
                kind=ObjectionKind.veto,
                reason="sold out",
            )
        ],
    )
    assert decision.drink_id == "kept"
    assert decision.score == 0.70
    assert decision.ask_human is False
    assert decision.question is None
    assert "sold-out" in decision.explanation


def test_close_scores_ask_the_human():
    decision = resolve(
        [_proposal("first", 0.80, "taste"), _proposal("second", 0.76, "social")],
        [],
    )
    assert decision.drink_id == "first"
    assert decision.ask_human is True
    assert decision.question
    assert "within 0.05" in decision.question
    assert [item.drink_id for item in decision.alternatives] == ["second"]


def test_clear_winner_does_not_ask():
    decision = resolve(
        [_proposal("first", 0.90), _proposal("second", 0.70)],
        [Objection(agent_id="explorer", target_drink_id="second", kind=ObjectionKind.concern, reason="tried")],
    )
    assert decision.drink_id == "first"
    assert decision.ask_human is False
    assert decision.alternatives[0].drink_id == "second"


def test_shop_agent_vetoes_sold_out_drink():
    write_dataset()
    catalog = load_catalog()
    request = DeliberationRequest(
        round="object",
        user_id="andrew",
        query="",
        candidate_drink_ids=["kf_brown_sugar_oolong"],
        sold_out_drink_ids=["kf_brown_sugar_oolong"],
    )
    reply = ShopAgent("kungfu", "Kung Fu Tea Co.").handle(request, catalog)
    assert reply.objections
    assert reply.objections[0].kind == ObjectionKind.veto
    assert reply.objections[0].target_drink_id == "kf_brown_sugar_oolong"
