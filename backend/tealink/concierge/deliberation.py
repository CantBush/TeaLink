"""Two-round deliberation streamed as Lens events."""

from __future__ import annotations

from collections.abc import AsyncIterator

from tealink.concierge.registry import Registry
from tealink.concierge.transport import AgentTransport
from tealink.core.resolution import resolve
from tealink.lens.recorder import LensRecorder
from tealink.schemas import (
    AgentReply,
    DeliberationRequest,
    LensEvent,
    LensEventType,
    Objection,
    Proposal,
)


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

    selections = registry.select_for_query(query)
    cards = []
    for selection in selections:
        yield emit(
            LensEventType.selection,
            selection.reason,
            selection.model_dump(mode="json"),
            selection.agent_id,
        )
        card = registry.get(selection.agent_id)
        if card is not None:
            cards.append(card)

    propose = DeliberationRequest(
        round="propose",
        user_id=user_id,
        query=query,
        preference_overrides=overrides,
        candidate_drink_ids=[],
        sold_out_drink_ids=sold_out,
    )
    propose_replies = await transport.broadcast(cards, propose)
    proposals = _proposals(propose_replies)
    for proposal in proposals:
        yield emit(
            LensEventType.proposal,
            proposal.rationale,
            proposal.model_dump(mode="json"),
            proposal.agent_id,
        )

    candidate_ids: list[str] = []
    for proposal in proposals:
        if proposal.drink_id not in candidate_ids:
            candidate_ids.append(proposal.drink_id)

    yield emit(
        LensEventType.status,
        "Collecting objections.",
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
    for objection in objections:
        yield emit(
            LensEventType.objection,
            objection.reason,
            objection.model_dump(mode="json"),
            objection.agent_id,
        )

    decision = resolve(proposals, objections)
    yield emit(
        LensEventType.decision,
        decision.explanation,
        decision.model_dump(mode="json"),
        None,
    )


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
