"""Profiles, follows, and the friends feed, held in memory.

Loaded from ``data/social.json`` (written by the seed) at startup and on
Reset demo. Like live picks, nothing here is written back to disk.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, Field

from tealink.config import get_settings
from tealink.schemas import STAT_KEYS, Avatar, FeedComment, FeedItem, StatKey

HANDLE = re.compile(r"^[a-z0-9_]{2,20}$")
# Handles that would collide with fixed routes under /users.
RESERVED_HANDLES = {"similar", "me", "new"}
DEFAULT_AVATAR = Avatar(emoji="🧋", color="#F4C27A")
DEFAULT_ACCENT = "#8B5E3C"
MAX_COMMENT = 280
MAX_BIO = 160


class ProfileSettings(BaseModel):
    user_id: str
    handle: str
    display_name: str
    bio: str = ""
    avatar: Avatar = Field(default_factory=lambda: DEFAULT_AVATAR.model_copy())
    accent: str = DEFAULT_ACCENT
    pinned_drink_id: str | None = None
    pinned_shop_id: str | None = None
    visible_stats: list[StatKey] = Field(default_factory=lambda: list(STAT_KEYS))


class StoredFeedItem(BaseModel):
    """A feed item plus who liked it. ``FeedItem`` is this, seen by one viewer."""

    id: str
    user_id: str
    kind: str
    drink_id: str | None = None
    rating: int | None = None
    text: str | None = None
    to_user_id: str | None = None
    created_at: str
    liked_by: list[str] = Field(default_factory=list)
    comments: list[FeedComment] = Field(default_factory=list)

    def view(self, viewer: str | None, author_for) -> FeedItem:
        """``author_for`` turns a user id into an Author, so the feed can render without extra requests."""
        comments = [comment.model_copy(update={"author": author_for(comment.user_id)}) for comment in self.comments]
        return FeedItem(
            id=self.id,
            user_id=self.user_id,
            kind=self.kind,  # type: ignore[arg-type]
            drink_id=self.drink_id,
            rating=self.rating,
            text=self.text,
            to_user_id=self.to_user_id,
            created_at=self.created_at,
            likes=len(self.liked_by),
            liked_by_me=viewer is not None and viewer in self.liked_by,
            comments=comments,
            author=author_for(self.user_id),
            to_author=author_for(self.to_user_id) if self.to_user_id else None,
        )


class QuizRecord(BaseModel):
    weights: dict[str, float]
    profile: dict[str, float]
    toppings: float = 0.5
    flavors: list[str] = Field(default_factory=list)


class SocialStore:
    def __init__(
        self,
        profiles: list[ProfileSettings],
        follows: list[tuple[str, str]],
        feed: list[StoredFeedItem],
    ) -> None:
        self.profiles: dict[str, ProfileSettings] = {profile.user_id: profile for profile in profiles}
        self.follows: set[tuple[str, str]] = set(follows)
        self.feed: dict[str, StoredFeedItem] = {item.id: item for item in feed}
        self.quiz: dict[str, QuizRecord] = {}
        self._next_id = 1

    # Profiles

    def profile(self, user_id: str) -> ProfileSettings:
        """Saved settings, or defaults for a user the seed never profiled."""
        found = self.profiles.get(user_id)
        if found is None:
            found = ProfileSettings(user_id=user_id, handle=user_id, display_name=user_id.title())
            self.profiles[user_id] = found
        return found

    def user_for_handle(self, handle: str) -> str | None:
        lowered = handle.lower().lstrip("@")
        for profile in self.profiles.values():
            if profile.handle == lowered:
                return profile.user_id
        return None

    def check_handle(self, handle: str, owner: str | None = None) -> str:
        """Lowercased handle, or ValueError if it's malformed or taken."""
        cleaned = handle.strip().lower().lstrip("@")
        if not HANDLE.match(cleaned):
            raise ValueError("handles are 2 to 20 lowercase letters, numbers, or underscores")
        if cleaned in RESERVED_HANDLES:
            raise ValueError(f"@{cleaned} is reserved")
        holder = self.user_for_handle(cleaned)
        if holder is not None and holder != owner:
            raise ValueError(f"@{cleaned} is taken")
        return cleaned

    # Follows

    def follow(self, viewer: str, target: str) -> None:
        if viewer == target:
            raise ValueError("you can't follow yourself")
        self.follows.add((viewer, target))

    def unfollow(self, viewer: str, target: str) -> None:
        self.follows.discard((viewer, target))

    def followers(self, user_id: str) -> list[str]:
        return sorted(follower for follower, followee in self.follows if followee == user_id)

    def following(self, user_id: str) -> list[str]:
        return sorted(followee for follower, followee in self.follows if follower == user_id)

    def is_following(self, viewer: str | None, target: str) -> bool:
        return viewer is not None and (viewer, target) in self.follows

    # Feed

    def add(
        self,
        user_id: str,
        kind: str,
        *,
        drink_id: str | None = None,
        rating: int | None = None,
        text: str | None = None,
        to_user_id: str | None = None,
    ) -> StoredFeedItem:
        item = StoredFeedItem(
            id=self._new_id("f"),
            user_id=user_id,
            kind=kind,
            drink_id=drink_id,
            rating=rating,
            text=text,
            to_user_id=to_user_id,
            created_at=now_iso(),
        )
        self.feed[item.id] = item
        return item

    def feed_for(self, viewer: str, limit: int = 50) -> list[StoredFeedItem]:
        """The viewer's own activity, people they follow, and recs sent to them. Newest first."""
        circle = set(self.following(viewer)) | {viewer}
        items = [item for item in self.feed.values() if item.user_id in circle or item.to_user_id == viewer]
        return sorted(items, key=lambda item: (parse_time(item.created_at), item.id), reverse=True)[:limit]

    def activity(self, user_id: str) -> list[StoredFeedItem]:
        return [item for item in self.feed.values() if item.user_id == user_id]

    def picks(self, user_id: str) -> list[str]:
        """Drinks the user picked from a top 3, oldest first."""
        mine = sorted(
            (item for item in self.activity(user_id) if item.kind == "pick" and item.drink_id),
            key=lambda item: (parse_time(item.created_at), item.id),
        )
        return [item.drink_id for item in mine if item.drink_id]

    def like(self, item_id: str, user_id: str) -> StoredFeedItem:
        item = self._item(item_id)
        if user_id not in item.liked_by:
            item.liked_by.append(user_id)
        return item

    def unlike(self, item_id: str, user_id: str) -> StoredFeedItem:
        item = self._item(item_id)
        if user_id in item.liked_by:
            item.liked_by.remove(user_id)
        return item

    def comment(self, item_id: str, user_id: str, text: str) -> StoredFeedItem:
        item = self._item(item_id)
        cleaned = text.strip()
        if not cleaned:
            raise ValueError("comments can't be empty")
        if len(cleaned) > MAX_COMMENT:
            raise ValueError(f"comments are at most {MAX_COMMENT} characters")
        item.comments.append(
            FeedComment(id=self._new_id("c"), user_id=user_id, text=cleaned, created_at=now_iso())
        )
        return item

    def _item(self, item_id: str) -> StoredFeedItem:
        item = self.feed.get(item_id)
        if item is None:
            raise KeyError(item_id)
        return item

    def _new_id(self, prefix: str) -> str:
        value = f"{prefix}_live_{self._next_id:04d}"
        self._next_id += 1
        return value


def now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def load_social(data_dir: Path | None = None) -> SocialStore:
    """Seeded social data. A missing file means nobody has a profile or follows yet."""
    path = (data_dir or get_settings().data_dir) / "social.json"
    if not path.exists():
        return SocialStore([], [], [])
    payload = json.loads(path.read_text(encoding="utf-8"))
    return SocialStore(
        profiles=[ProfileSettings.model_validate(row) for row in payload.get("profiles", [])],
        follows=[(row[0], row[1]) for row in payload.get("follows", [])],
        feed=[StoredFeedItem.model_validate(row) for row in payload.get("feed", [])],
    )
