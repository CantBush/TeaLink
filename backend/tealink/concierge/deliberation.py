"""Two-round deliberation streamed as Lens events.

Round 1: objective agents propose drinks; the Preference agent reports the
user's learned weights. Round 2: every agent scores or vets every candidate.
The resolver ranks by those weights and returns the top 3.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from tealink.concierge.registry import Registry
from tealink.concierge.transport import AgentTransport
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
)

LISTED = 2


async def deliberate(
    *,
    registry: Registry,
    transport: AgentTransport,
    user_id: str,
    query: str,
    preference_overrides: dict[str, float] | None = None,
    sold_out_drink_ids: list[str] | None = None,
    recorder: LensRecorder | None = None,
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
        )
        log.record(event)
        seq += 1
        return event

    yield emit(LensEventType.status, "Starting deliberation.", {}, None)

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
    )
    propose_replies = await transport.broadcast(cards, propose)

    report = _preference(propose_replies)
    if report is None:
        weights = dict(PRIOR)
        yield emit(
            LensEventType.preference,
            "No Preference agent answered, so default priorities are used.",
            {"weights": weights, "summary": describe_weights(weights, 0), "choices_seen": 0},
            None,
        )
    else:
        weights = report.weights
        yield emit(LensEventType.preference, report.summary, report.model_dump(mode="json"), "preference")

    proposals = _proposals(propose_replies)
    for proposal in proposals:
        yield emit(
            LensEventType.proposal,
            f"{proposal.agent_id.capitalize()} proposes {proposal.drink_name}.",
            proposal.model_dump(mode="json"),
            proposal.agent_id,
        )

    candidate_ids: list[str] = []
    for proposal in proposals:
        if proposal.drink_id not in candidate_ids:
            candidate_ids.append(proposal.drink_id)

    yield emit(
        LensEventType.status,
        f"{len(candidate_ids)} candidates. Every agent now scores each one by its own objective.",
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
    objections = _objections(object_replies)
    names = {proposal.drink_id: proposal.drink_name for proposal in proposals}
    for reply in object_replies:
        for objection in reply.objections:
            if objection.kind == ObjectionKind.veto:
                yield emit(
                    LensEventType.objection,
                    f"Veto: {objection.reason}",
                    objection.model_dump(mode="json"),
                    objection.agent_id,
                )
        summary = _summarize(reply, names, registry)
        if summary is not None:
            yield emit(LensEventType.objection, summary["reason"], summary, reply.agent_id)

    decision = resolve(proposals, objections, weights=weights, confirmed_shop_ids=confirmed_shops)
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


def _summarize(reply: AgentReply, names: dict[str, str], registry: Registry) -> dict | None:
    """One timeline entry per agent: what it backs and what it pushes back on."""
    rated = [item for item in reply.objections if item.kind != ObjectionKind.veto]
    if not rated:
        return None
    rated.sort(key=lambda item: (-(item.score if item.score is not None else 1.0), item.target_drink_id))
    backs = [names.get(item.target_drink_id, item.target_drink_id) for item in rated if item.kind == ObjectionKind.support]
    doubts = [names.get(item.target_drink_id, item.target_drink_id) for item in reversed(rated) if item.kind == ObjectionKind.concern]
    card = registry.get(reply.agent_id)
    if card is not None and card.shop_id:
        label = card.name.removesuffix(" agent")
        reason = f"{label} confirms in stock: {_listing(backs)}."
    else:
        parts = []
        if backs:
            parts.append("backs " + _listing(backs))
        if doubts:
            parts.append("pushes back on " + _listing(doubts))
        label = card.name if card is not None else reply.agent_id
        reason = f"{label} " + ("; ".join(parts) if parts else "has no strong view on any candidate") + "."
    return {
        "agent_id": reply.agent_id,
        "kind": "concern" if doubts else "support",
        "reason": reason,
        "objections": [item.model_dump(mode="json") for item in reply.objections],
    }


def _listing(items: list[str]) -> str:
    shown = ", ".join(items[:LISTED])
    extra = len(items) - LISTED
    return shown + (f" (+{extra} more)" if extra > 0 else "")


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
