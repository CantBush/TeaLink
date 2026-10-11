"""Deliberation streamed as Lens events.

Propose, then one objection round. ``DELIBERATION=single`` (the default)
resolves on those scores. ``dialogue`` relays the objections and lets
objective teagents soften, up to three rebuttals, then resolves on the latest
complete scores.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from typing import Literal, cast

from tealink.concierge.registry import Registry
from tealink.concierge.transport import AgentTransport, ReviseTimeout
from tealink.agents.critic_agent import CriticAgent
from tealink.config import get_settings
from tealink.core.offers import apply_offer
from tealink.core.preferences import PRIOR, describe_weights
from tealink.core.resolution import resolve
from tealink.lens.recorder import LensRecorder
from tealink.schemas import (
    AgentReply,
    DeliberationRequest,
    LensEvent,
    LensEventType,
    Objection,
    ObjectionKind,
    PreferenceReport,
    Proposal,
    RevisedFrom,
    TraceRecord,
)

LISTED = 2
MAX_REBUTTALS = 3
_SCORE_EPSILON = 1e-9


async def deliberate(
    *,
    registry: Registry,
    transport: AgentTransport,
    user_id: str,
    query: str,
    preference_overrides: dict[str, float] | None = None,
    sold_out_drink_ids: list[str] | None = None,
    recorder: LensRecorder | None = None,
    prior_weights: dict[str, float] | None = None,
    price_low: float | None = None,
    price_high: float | None = None,
    max_price: float | None = None,
    offer_gate=None,
    session_id: str | None = None,
    stopped_agents: set[str] | None = None,
    trace_sink: Callable[[TraceRecord], None] | None = None,
    critic_enabled: bool = False,
) -> AsyncIterator[LensEvent]:
    log = recorder or LensRecorder()
    seq = 1
    overrides = dict(preference_overrides or {})
    sold_out = list(sold_out_drink_ids or [])

    def emit(
        event_type: LensEventType,
        message: str,
        payload: dict,
        agent_id: str | None = None,
    ) -> LensEvent:
        nonlocal seq
        event = LensEvent(
            type=event_type,
            agent_id=agent_id,
            message=message,
            payload=payload,
            seq=seq,
            session_id=session_id,
        )
        log.record(event)
        seq += 1
        return event

    yield emit(LensEventType.status, "Starting deliberation.", {}, None)

    missing_agents = sorted(stopped_agents or ())
    for agent_id in missing_agents:
        card = registry.get(agent_id)
        label = card.name if card is not None else agent_id
        yield emit(
            LensEventType.agent_lost,
            f"{label} is unavailable, so the team will decide without it.",
            {"agent_id": agent_id, "reason": "stopped for this round", "when": "before_round"},
            agent_id,
        )

    cards = []
    for selection in registry.select_for_query(query):
        yield emit(
            LensEventType.selection,
            selection.reason,
            selection.model_dump(mode="json"),
            selection.agent_id,
        )
        card = registry.get(selection.agent_id)
        if card is not None:
            cards.append(card)
    confirmed_shops = {card.shop_id for card in cards if card.shop_id}

    propose = DeliberationRequest(
        round="propose",
        user_id=user_id,
        query=query,
        preference_overrides=overrides,
        sold_out_drink_ids=sold_out,
        prior_weights=prior_weights,
        max_price=max_price,
    )
    propose_replies = await transport.broadcast(cards, propose)
    _capture_trace(transport, 0, trace_sink)

    report = _preference(propose_replies)
    if report is None:
        weights = dict(prior_weights or PRIOR)
        basis = "quiz" if prior_weights else "default"
        yield emit(
            LensEventType.preference,
            f"No Preference teagent answered, so {basis} priorities are used.",
            {
                "weights": weights,
                "summary": describe_weights(weights, 0, from_quiz=prior_weights is not None),
                "choices_seen": 0,
            },
            None,
        )
    else:
        weights = report.weights
        yield emit(LensEventType.preference, report.summary, report.model_dump(mode="json"), "preference")

    proposals = _proposals(propose_replies)
    for proposal in proposals:
        payload = proposal.model_dump(mode="json")
        payload["round"] = 0
        yield emit(
            LensEventType.proposal,
            f"{proposal.agent_id.capitalize()} proposes {proposal.drink_name}.",
            payload,
            proposal.agent_id,
        )

    candidate_ids: list[str] = []
    for proposal in proposals:
        if proposal.drink_id not in candidate_ids:
            candidate_ids.append(proposal.drink_id)

    yield emit(
        LensEventType.status,
        f"{len(candidate_ids)} candidates. Every teagent now scores each one by its own objective.",
        {"candidate_drink_ids": candidate_ids},
        None,
    )

    object_request = DeliberationRequest(
        round="object",
        user_id=user_id,
        query=query,
        preference_overrides=overrides,
        candidate_drink_ids=candidate_ids,
        sold_out_drink_ids=sold_out,
    )
    object_replies = await transport.broadcast(cards, object_request)
    _capture_trace(transport, 1, trace_sink)
    objections = _plain(_objections(object_replies))
    names = {proposal.drink_id: proposal.drink_name for proposal in proposals}
    for event in _emit_objections(object_replies, names, registry, 1, {}, emit):
        yield event

    decided_by: Literal["agents", "arbiter"] = "arbiter"
    rebuttals = 0
    if get_settings().deliberation == "dialogue":
        previous = objections
        for rebuttal in range(1, MAX_REBUTTALS + 1):
            event_round = rebuttal + 1
            try:
                revise_replies = await transport.broadcast(
                    cards,
                    DeliberationRequest(
                        round="revise",
                        user_id=user_id,
                        query=query,
                        preference_overrides=overrides,
                        candidate_drink_ids=candidate_ids,
                        sold_out_drink_ids=sold_out,
                        peer_objections=previous,
                    ),
                )
            except ReviseTimeout:
                objections = previous
                decided_by = "arbiter"
                break
            incoming = _objections(revise_replies)
            _capture_trace(transport, event_round, trace_sink)
            for event in _emit_objections(revise_replies, names, registry, event_round, _index(previous), emit):
                yield event
            rebuttals = rebuttal
            objections = _plain(incoming)
            if not _changed(previous, objections):
                decided_by = "agents"
                break
            previous = objections
            decided_by = "arbiter"

    decision = resolve(proposals, objections, weights=weights, confirmed_shop_ids=confirmed_shops)
    decision = decision.model_copy(
        update={"decided_by": decided_by, "rounds": rebuttals, "missing_agents": missing_agents}
    )
    if price_low is not None and price_high is not None:
        offered = await _ask_for_offer(decision, registry, transport, user_id, query, offer_gate)
        if offered is not None:
            reply, runner = offered
            _capture_trace(transport, rebuttals + 2, trace_sink)
            yield emit(
                LensEventType.offer,
                reply.offer.reason,
                reply.offer.model_dump(mode="json"),
                reply.agent_id,
            )
            decision = apply_offer(decision, runner.drink_id, reply.offer, price_low, price_high)
    if critic_enabled:
        critique = CriticAgent().review(decision)
        if critique is not None:
            decision = decision.model_copy(update={"critique": critique})
            yield emit(
                LensEventType.critique,
                (
                    f"Critic: {critique.weakest_reason} "
                    "The arbiter kept the pick because it still has the highest combined score."
                ),
                critique.model_dump(mode="json"),
                CriticAgent.agent_id,
            )
    for item in decision.dropped:
        if item.by == "registry":
            yield emit(
                LensEventType.status,
                f"Dropped {item.drink_name}: {item.reason}",
                item.model_dump(mode="json"),
                None,
            )
    yield emit(
        LensEventType.decision,
        decision.explanation,
        decision.model_dump(mode="json"),
        None,
    )


def _capture_trace(transport: AgentTransport, round_number: int, sink: Callable[[TraceRecord], None] | None) -> None:
    if sink is None:
        return
    drain = getattr(transport, "drain_traces", None)
    if not callable(drain):
        return
    for item in drain():
        sink(
            TraceRecord(
                round=round_number,
                agent_id=item.agent_id,
                transport=item.transport,
                ms=item.ms,
                retries=item.retries,
                fell_back=item.fell_back,
            )
        )


def _dump_objection(item: Objection, event_round: int) -> dict:
    data = item.model_dump(mode="json")
    if data.get("revised_from") is None:
        data.pop("revised_from", None)
    data["round"] = event_round
    return data


def _index(objections: list[Objection]) -> dict[tuple[str, str], Objection]:
    return {(item.agent_id, item.target_drink_id): item for item in objections}


def _same_stance(old: Objection, new: Objection) -> bool:
    if old.kind != new.kind:
        return False
    if old.score is None or new.score is None:
        return old.score is new.score
    return abs(old.score - new.score) <= _SCORE_EPSILON


def _plain(objections: list[Objection]) -> list[Objection]:
    """Drop revision markers so the next request carries the stance, not the diff."""
    return [item.model_copy(update={"revised_from": None, "round": None}) for item in objections]


def _changed(before: list[Objection], after: list[Objection]) -> bool:
    prior = _index(before)
    current = _index(after)
    if set(prior) != set(current):
        return True
    return any(not _same_stance(prior[key], current[key]) for key in prior)


def _annotate(reply: AgentReply, prior: dict[tuple[str, str], Objection]) -> AgentReply:
    """Stamp ``revised_from`` on stances that moved. Vetoes never get one."""
    updated: list[Objection] = []
    for item in reply.objections:
        old = prior.get((item.agent_id, item.target_drink_id))
        revised = None
        if (
            old is not None
            and item.kind != ObjectionKind.veto
            and old.kind != ObjectionKind.veto
            and old.kind in (ObjectionKind.concern, ObjectionKind.neutral, ObjectionKind.support)
            and not _same_stance(old, item)
        ):
            revised = RevisedFrom(
                kind=cast(Literal["support", "concern", "neutral"], old.kind.value),
                score=old.score,
            )
        updated.append(item.model_copy(update={"revised_from": revised}))
    return reply.model_copy(update={"objections": updated})


def _emit_objections(
    replies: list[AgentReply],
    names: dict[str, str],
    registry: Registry,
    event_round: int,
    prior: dict[tuple[str, str], Objection],
    emit: Callable[..., LensEvent],
) -> list[LensEvent]:
    events: list[LensEvent] = []
    for reply in replies:
        annotated = _annotate(reply, prior)
        for objection in annotated.objections:
            if objection.kind != ObjectionKind.veto:
                continue
            events.append(
                emit(
                    LensEventType.objection,
                    f"Veto: {objection.reason}",
                    _dump_objection(objection, event_round),
                    objection.agent_id,
                )
            )
        summary = _summarize(annotated, names, registry, event_round)
        if summary is not None:
            events.append(emit(LensEventType.objection, summary["reason"], summary, reply.agent_id))
    return events


def _summarize(reply: AgentReply, names: dict[str, str], registry: Registry, event_round: int) -> dict | None:
    """One timeline entry per teagent: what it backs and what it pushes back on."""
    rated = [item for item in reply.objections if item.kind != ObjectionKind.veto]
    if not rated:
        return None
    rated.sort(key=lambda item: (-(item.score if item.score is not None else 1.0), item.target_drink_id))
    backs = [names.get(item.target_drink_id, item.target_drink_id) for item in rated if item.kind == ObjectionKind.support]
    doubts = [names.get(item.target_drink_id, item.target_drink_id) for item in reversed(rated) if item.kind == ObjectionKind.concern]
    card = registry.get(reply.agent_id)
    if card is not None and card.shop_id:
        label = card.name.removesuffix(" teagent").removesuffix(" agent")
        reason = f"{label} confirms in stock: {_listing(backs)}."
    else:
        parts = []
        if backs:
            parts.append("backs " + _listing(backs))
        if doubts:
            parts.append("pushes back on " + _listing(doubts))
        label = card.name if card is not None else reply.agent_id
        reason = f"{label} " + ("; ".join(parts) if parts else "has no strong view on any candidate") + "."
    objections = [_dump_objection(item, event_round) for item in reply.objections]
    revisions = [item["revised_from"] for item in objections if item.get("revised_from")]
    payload = {
        "agent_id": reply.agent_id,
        "kind": "concern" if doubts else "support",
        "reason": reason,
        "round": event_round,
        "objections": objections,
    }
    # One concession can sit on the event itself. Several stay on each objection.
    if len(revisions) == 1:
        payload["revised_from"] = revisions[0]
    return payload


def _listing(items: list[str]) -> str:
    shown = ", ".join(items[:LISTED])
    extra = len(items) - LISTED
    return shown + (f" (+{extra} more)" if extra > 0 else "")


async def _ask_for_offer(decision, registry, transport, user_id: str, query: str, offer_gate=None):
    """In a near-tie between two shops, ask the trailing shop for a discount."""
    options = decision.options
    if not decision.ask_human or len(options) < 2 or options[0].shop_id == options[1].shop_id:
        return None
    leader, runner = options[0], options[1]
    # A discount only helps a shop that is behind on price. One that already
    # wins on cost is trailing for another reason, and paying to overturn that
    # would buy the ranking.
    if runner.dimension_scores.get("cost", 0.0) >= leader.dimension_scores.get("cost", 0.0):
        return None
    card = registry.get(f"shop_{runner.shop_id}")
    if card is None:
        return None
    reply = await transport.send(
        card,
        DeliberationRequest(
            round="offer",
            user_id=user_id,
            query=query,
            candidate_drink_ids=[runner.drink_id],
        ),
    )
    if reply.offer is None:
        return None
    if offer_gate is not None:
        adjusted = offer_gate(runner.shop_id, runner.drink_id, reply.offer)
        if adjusted is None:
            return None
        reply = reply.model_copy(update={"offer": adjusted})
    return reply, runner


def _preference(replies: list[AgentReply]) -> PreferenceReport | None:
    for reply in replies:
        if reply.preference is not None:
            return reply.preference
    return None


def _proposals(replies: list[AgentReply]) -> list[Proposal]:
    found: list[Proposal] = []
    for reply in replies:
        found.extend(reply.proposals)
    return found


def _objections(replies: list[AgentReply]) -> list[Objection]:
    found: list[Objection] = []
    for reply in replies:
        found.extend(reply.objections)
    return found
