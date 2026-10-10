"""In-memory log of Lens events for one deliberation."""

from __future__ import annotations

from tealink.schemas import LensEvent


class LensRecorder:
    def __init__(self) -> None:
        self.events: list[LensEvent] = []

    def record(self, event: LensEvent) -> LensEvent:
        self.events.append(event)
        return event

    def __len__(self) -> int:
        return len(self.events)
