"""Social routes: sign-up, the onboarding quiz, profiles, follows, and the feed.

Mounted after the routes in ``main`` so ``/users/similar`` keeps matching
first. Nothing here changes how the teagents deliberate, except that a quiz
gives a new user their own taste profile and starting priorities.
"""

from __future__ import annotations

import base64
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from tealink.agents.scoring import user_profile
from tealink.auth import store as accounts
from tealink.core import quiz as quiz_core
from tealink.core.preferences import PRIOR, normalize
from tealink.core.taste import FAVORITE_WEIGHT
from tealink.core.similarity import cosine_similarity
from tealink.core.stats import boba_stats
from tealink.schemas import (
    STAT_FIELDS,
    Author,
    Avatar,
    BobaStats,
    DeliberationRequest,
    FeedItem,
    Notification,
    PastOrder,
    QuizResult,
    Review,
    StatKey,
    User,
    UserProfile,
)
from tealink.social.store import MAX_BIO, MAX_COMMENT, QuizRecord, parse_time

router = APIRouter()

ACTIVITY_KINDS = {"review", "pick", "rec"}
# Placeholder banners. Same ids as frontend/src/lib/images.ts.
COVER_IDS = frozenset({"pearls", "leaves", "swirl", "fruit", "matcha", "lineup"})


class NewUser(BaseModel):
    handle: str
    display_name: str = ""


class FavoritePick(BaseModel):
    shop_id: str
    drink_ids: list[str]


class QuizAnswers(BaseModel):
    user_id: str
    answers: dict[str, str | list[str]]
    kind: Literal["basic", "full"] = "basic"
    favorites: list[FavoritePick] | None = None


class ProfilePatch(BaseModel):
    handle: str | None = None
    display_name: str | None = Field(default=None, max_length=40)
    bio: str | None = Field(default=None, max_length=MAX_BIO)
    avatar: Avatar | None = None
    accent: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    card_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    pinned_drink_id: str | None = None
    pinned_shop_id: str | None = None
    visible_stats: list[StatKey] | None = None
    cover_url: str | None = None


class Viewer(BaseModel):
    viewer: str


class Actor(BaseModel):
    viewer: str


class CommentBody(BaseModel):
    viewer: str
    text: str = Field(max_length=MAX_COMMENT)


class PostBody(BaseModel):
    text: str
    photo_url: str | None = None
    drink_id: str | None = None
    shop_id: str | None = None


class ReadBody(BaseModel):
    ids: list[str] | None = None


class RecBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_user: str = Field(alias="from")
    to: str
    drink_id: str
    text: str = Field(default="", max_length=MAX_COMMENT)


def _runtime():
    from tealink.api.main import get_runtime

    return get_runtime()


def _resolve(runtime, ref: str) -> str:
    """A user id, or a handle (with or without @)."""
    if ref in runtime.catalog.users_by_id:
        return ref
    found = runtime.social.user_for_handle(ref)
    if found is None or found not in runtime.catalog.users_by_id:
        raise HTTPException(status_code=404, detail="user not found")
    return found


def _known(runtime, user_id: str | None) -> str | None:
    """Viewers who no longer exist (say, after Reset demo) read as signed out."""
    return user_id if user_id in runtime.catalog.users_by_id else None


def _require(runtime, user_id: str) -> str:
    if user_id not in runtime.catalog.users_by_id:
        raise HTTPException(status_code=404, detail=f"user {user_id!r} not found")
    return user_id


def prior_weights(runtime, user_id: str) -> dict[str, float] | None:
    record = runtime.social.quiz.get(user_id)
    return dict(record.weights) if record else None


async def current_weights(runtime, user_id: str) -> dict[str, float]:
    """What the Preference teagent believes now: quiz prior plus every pick."""
    from tealink.api.main import _prepare

    await _prepare(runtime)
    prior = prior_weights(runtime, user_id)
    card = runtime.registry.get("preference")
    if card is not None:
        request = DeliberationRequest(round="propose", user_id=user_id, query="", prior_weights=prior)
        reply = await runtime.transport.send(card, request)
        if reply.preference is not None:
            return reply.preference.weights
    return normalize(prior or PRIOR)


async def compute_stats(runtime, user_id: str) -> BobaStats:
    record = runtime.social.quiz.get(user_id)
    activity = [
        parse_time(item.created_at)
        for item in runtime.social.activity(user_id)
        if item.kind in ACTIVITY_KINDS
    ]
    from tealink.store.orders import history

    stats = boba_stats(
        runtime.catalog,
        user_id,
        profile=user_profile(runtime.catalog, user_id),
        weights=await current_weights(runtime, user_id),
        picks=runtime.social.picks(user_id),
        activity=activity,
        now=datetime.now(UTC),
        quiz_toppings=record.toppings if record else None,
        quiz_flavors=record.flavors if record else None,
    )
    stats.past_orders = [PastOrder.model_validate(row) for row in history(runtime, user_id)]
    return stats


def _session(request: Request) -> dict:
    runtime = _runtime()
    account = accounts.account_for_token(request.cookies.get(accounts.COOKIE))
    if account is None:
        raise HTTPException(status_code=401, detail="sign in required")
    if account["user_id"] not in runtime.catalog.users_by_id:
        raise HTTPException(status_code=403, detail="sign in as a customer")
    return account


def taste_match(runtime, viewer: str | None, user_id: str) -> float | None:
    if viewer is None or viewer == user_id:
        return None
    catalog = runtime.catalog
    for someone in (viewer, user_id):
        if not catalog.reviews_for(someone) and someone not in catalog.base_profiles:
            return None
    return round(cosine_similarity(user_profile(catalog, viewer), user_profile(catalog, user_id)), 4)


async def profile_view(runtime, user_id: str, viewer: str | None) -> UserProfile:
    settings = runtime.social.profile(user_id)
    stats = await compute_stats(runtime, user_id)
    if viewer == user_id:
        shown = stats.model_dump(mode="json")
    else:
        dumped = stats.model_dump(mode="json")
        shown = {STAT_FIELDS[key]: dumped[STAT_FIELDS[key]] for key in settings.visible_stats}
        shown["personality"] = stats.personality
    profile = UserProfile(
        user_id=user_id,
        handle=settings.handle,
        display_name=settings.display_name,
        bio=settings.bio,
        avatar=settings.avatar,
        accent=settings.accent,
        card_color=settings.card_color,
        pinned_drink_id=settings.pinned_drink_id,
        pinned_shop_id=settings.pinned_shop_id,
        visible_stats=list(settings.visible_stats),
        followers=len(runtime.social.followers(user_id)),
        following=len(runtime.social.following(user_id)),
        followed_by_me=runtime.social.is_following(viewer, user_id),
        taste_match=taste_match(runtime, viewer, user_id),
        stats=shown,
        cover_url=settings.cover_url,
        bestea=runtime.social.bestea_status(viewer, user_id),
        besteas=runtime.social.bestea_count(user_id),
        quiz_kind=runtime.social.quiz[user_id].kind if user_id in runtime.social.quiz else None,
    )
    if viewer != user_id and "past_orders" in profile.stats:
        for row in profile.stats["past_orders"]:
            row.pop("rating", None)
    return profile


def _author(runtime, user_id: str) -> Author:
    settings = runtime.social.profile(user_id)
    return Author(handle=settings.handle, display_name=settings.display_name, avatar=settings.avatar)


def _feed(runtime, item, viewer: str) -> FeedItem:
    return item.view(viewer, lambda user_id: _author(runtime, user_id))


def _summary(runtime, user_id: str, viewer: str | None) -> dict:
    settings = runtime.social.profile(user_id)
    return {
        "user_id": user_id,
        "handle": settings.handle,
        "display_name": settings.display_name,
        "avatar": settings.avatar.model_dump(mode="json"),
        "followed_by_me": runtime.social.is_following(viewer, user_id),
        "taste_match": taste_match(runtime, viewer, user_id),
    }


# Sign-up and quiz


@router.get("/quiz")
def get_quiz(kind: str = "basic") -> list:
    """No ``kind`` is the six-question quiz. ``kind=full`` adds the longer taste questions and favorites."""
    if kind not in ("basic", "full"):
        raise HTTPException(status_code=422, detail="quiz kind must be basic or full")
    runtime = _runtime()
    asked = quiz_core.questions(runtime.catalog.shops) if kind == "basic" else quiz_core.full_questions()
    return [question.model_dump(mode="json") for question in asked]


@router.post("/users")
async def create_user(body: NewUser) -> UserProfile:
    runtime = _runtime()
    try:
        handle = runtime.social.check_handle(body.handle)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if handle in runtime.catalog.users_by_id:
        raise HTTPException(status_code=409, detail=f"@{handle} is taken")
    name = body.display_name.strip()[:40] or handle
    runtime.catalog.add_user(User(id=handle, name=name, persona=""))
    settings = runtime.social.profile(handle)
    settings.handle = handle
    settings.display_name = name
    runtime.social.add(handle, "joined")
    return await profile_view(runtime, handle, handle)


def effective_overrides(runtime, user_id: str) -> dict[str, float]:
    """Quiz flavors to avoid, then any what-if the user set on top."""
    overrides: dict[str, float] = {}
    record = runtime.social.quiz.get(user_id)
    if record is not None:
        for tag in record.avoids:
            overrides[tag] = 0.0
    overrides.update(runtime.preferences.get(user_id, {}))
    return overrides


def _store_favorites(runtime, user_id: str, favorites: list[FavoritePick] | None) -> None:
    """Replace this user's favorites. Each drink has to be on that shop's menu.

    A favorite is a 5-star review at double weight, so Taste, Social, and
    Explorer treat it as stronger evidence than a quiz answer.
    """
    groups = favorites or []
    checked: list[tuple[str, str]] = []
    for group in groups:
        if runtime.catalog.shop(group.shop_id) is None:
            raise ValueError("shop not found")
        if not group.drink_ids:
            raise ValueError("pick at least one favorite drink")
        for drink_id in group.drink_ids:
            drink = runtime.catalog.drink(drink_id)
            if drink is None or drink.shop_id != group.shop_id:
                raise ValueError(f"{drink_id} is not on that shop's menu")
            checked.append((group.shop_id, drink_id))
    runtime.catalog.drop_prefixed(user_id, f"fav_{user_id}_")
    for _shop_id, drink_id in checked:
        runtime.catalog.upsert_review(
            Review(
                id=f"fav_{user_id}_{drink_id}",
                user_id=user_id,
                drink_id=drink_id,
                rating=5,
                text="A favorite.",
                evidence_weight=FAVORITE_WEIGHT,
            )
        )


@router.post("/quiz")
async def take_quiz(body: QuizAnswers) -> QuizResult:
    runtime = _runtime()
    user_id = _require(runtime, body.user_id)
    try:
        outcome = quiz_core.score(body.answers, runtime.catalog.shops, kind=body.kind)
        if body.kind == "full" or body.favorites is not None:
            _store_favorites(runtime, user_id, body.favorites)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    runtime.catalog.set_base_profile(user_id, outcome.profile)
    runtime.social.quiz[user_id] = QuizRecord(
        weights=outcome.weights,
        profile=outcome.profile,
        toppings=outcome.toppings,
        flavors=outcome.flavors,
        kind=outcome.kind,
        avoids=outcome.avoids,
    )
    stats = await compute_stats(runtime, user_id)
    return QuizResult(user_id=user_id, personality=stats.personality, stats=stats, weights=stats.priorities)


# Profiles and follows


@router.get("/users")
async def list_users(viewer: str) -> list[UserProfile]:
    """Everyone except the viewer, closest taste match first. For "Suggested for you"."""
    runtime = _runtime()
    viewer_id = _require(runtime, viewer)
    profiles = [
        await profile_view(runtime, user.id, viewer_id)
        for user in runtime.catalog.users
        if user.id != viewer_id
    ]
    profiles.sort(key=lambda profile: (-(profile.taste_match or 0.0), profile.handle))
    return profiles


@router.get("/users/{ref}")
async def get_user(ref: str, viewer: str | None = None) -> UserProfile:
    runtime = _runtime()
    return await profile_view(runtime, _resolve(runtime, ref), _known(runtime, viewer))


@router.patch("/users/{ref}")
async def edit_user(ref: str, body: ProfilePatch) -> UserProfile:
    runtime = _runtime()
    user_id = _resolve(runtime, ref)
    settings = runtime.social.profile(user_id)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("handle") is not None:
        try:
            changes["handle"] = runtime.social.check_handle(changes["handle"], owner=user_id)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    drink_id = changes.get("pinned_drink_id")
    if drink_id is not None and runtime.catalog.drink(drink_id) is None:
        raise HTTPException(status_code=422, detail="pinned drink not found")
    shop_id = changes.get("pinned_shop_id")
    if shop_id is not None and runtime.catalog.shop(shop_id) is None:
        raise HTTPException(status_code=422, detail="pinned shop not found")
    if "visible_stats" in changes:
        visible = changes["visible_stats"] or []
        if len(set(visible)) != len(visible):
            raise HTTPException(status_code=422, detail="each stat can appear once")
    for key in ("handle", "display_name", "bio", "avatar", "accent", "visible_stats"):
        if key in changes and changes[key] is None:
            changes.pop(key)
    if "avatar" in body.model_fields_set and body.avatar is not None:
        changes["avatar"] = _avatar_update(settings.avatar, body.avatar)
    if "cover_url" in changes:
        try:
            changes["cover_url"] = _check_cover(changes["cover_url"])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    if "display_name" in changes:
        changes["display_name"] = changes["display_name"].strip() or settings.display_name
    for key, value in changes.items():
        setattr(settings, key, value)
    return await profile_view(runtime, user_id, user_id)


@router.post("/users/{ref}/follow")
async def follow(ref: str, body: Viewer) -> UserProfile:
    runtime = _runtime()
    target = _resolve(runtime, ref)
    viewer = _require(runtime, body.viewer)
    try:
        runtime.social.follow(viewer, target)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return await profile_view(runtime, target, viewer)


@router.delete("/users/{ref}/follow")
async def unfollow(ref: str, body: Viewer) -> UserProfile:
    runtime = _runtime()
    target = _resolve(runtime, ref)
    viewer = _require(runtime, body.viewer)
    runtime.social.unfollow(viewer, target)
    return await profile_view(runtime, target, viewer)


@router.get("/users/{ref}/followers")
def followers(ref: str, viewer: str | None = None) -> dict:
    runtime = _runtime()
    user_id = _resolve(runtime, ref)
    viewer = _known(runtime, viewer)
    return {"users": [_summary(runtime, other, viewer) for other in runtime.social.followers(user_id)]}


@router.get("/users/{ref}/following")
def following(ref: str, viewer: str | None = None) -> dict:
    runtime = _runtime()
    user_id = _resolve(runtime, ref)
    viewer = _known(runtime, viewer)
    return {"users": [_summary(runtime, other, viewer) for other in runtime.social.following(user_id)]}


# Feed


@router.get("/feed")
def feed(user_id: str, author: str | None = None, limit: int = 50) -> list[FeedItem]:
    runtime = _runtime()
    viewer = _require(runtime, user_id)
    limit = max(1, min(limit, 200))
    if author is None:
        items = runtime.social.feed_for(viewer, limit)
    else:
        target = _resolve(runtime, author)
        items = sorted(
            (item for item in runtime.social.activity(target) if item.kind != "pick"),
            key=lambda item: (parse_time(item.created_at), item.id),
            reverse=True,
        )[:limit]
    return [_feed(runtime, item, viewer) for item in items]


def _feed_item(runtime, item_id: str):
    item = runtime.social.feed.get(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="feed item not found")
    return item


@router.post("/feed/{item_id}/like")
def like(item_id: str, body: Actor) -> FeedItem:
    runtime = _runtime()
    user_id = _require(runtime, body.viewer)
    _feed_item(runtime, item_id)
    return _feed(runtime, runtime.social.like(item_id, user_id), user_id)


@router.delete("/feed/{item_id}/like")
def unlike(item_id: str, body: Actor) -> FeedItem:
    runtime = _runtime()
    user_id = _require(runtime, body.viewer)
    _feed_item(runtime, item_id)
    return _feed(runtime, runtime.social.unlike(item_id, user_id), user_id)


@router.post("/feed/{item_id}/comments")
def comment(item_id: str, body: CommentBody) -> FeedItem:
    runtime = _runtime()
    user_id = _require(runtime, body.viewer)
    _feed_item(runtime, item_id)
    try:
        item = runtime.social.comment(item_id, user_id, body.text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _feed(runtime, item, user_id)


@router.post("/recs")
def send_rec(body: RecBody) -> FeedItem:
    runtime = _runtime()
    sender = _require(runtime, body.from_user)
    receiver = _require(runtime, body.to)
    if sender == receiver:
        raise HTTPException(status_code=422, detail="send recs to someone else")
    if runtime.catalog.drink(body.drink_id) is None:
        raise HTTPException(status_code=422, detail="drink not found")
    if not runtime.social.is_following(receiver, sender):
        raise HTTPException(status_code=403, detail="you can only send recs to people who follow you")
    note = body.text.strip() or None
    item = runtime.social.add(sender, "rec", drink_id=body.drink_id, text=note, to_user_id=receiver)
    runtime.social.notify(receiver, "rec", sender, drink_id=body.drink_id, text=note)
    return _feed(runtime, item, sender)


def _check_photo(value: str | None, max_width: int, max_height: int) -> str | None:
    if not value:
        return None
    prefix = "data:image/jpeg;base64,"
    if not value.startswith(prefix):
        raise ValueError("photo must be a JPEG")
    try:
        raw = base64.b64decode(value[len(prefix) :], validate=True)
    except Exception as exc:
        raise ValueError("photo must be a JPEG") from exc
    width, height = _jpeg_size(raw)
    if width > max_width or height > max_height:
        if max_width == max_height:
            raise ValueError(f"photo must be at most {max_width} px a side")
        raise ValueError(f"photo must be at most {max_width} px wide and {max_height} px tall")
    return value


def _check_cover(value: str | None) -> str | None:
    if value is None or value in COVER_IDS:
        return value
    checked = _check_photo(value, 1600, 1600)
    if checked is None:
        raise ValueError("cover must be a placeholder or a JPEG")
    return checked


def _avatar_update(current: Avatar, patch: Avatar) -> Avatar:
    data = patch.model_dump(exclude_unset=True)
    if "photo_url" in patch.model_fields_set:
        if patch.photo_url is None:
            data["photo_url"] = None
        else:
            try:
                checked = _check_photo(patch.photo_url, 512, 512)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            if checked is None:
                raise HTTPException(status_code=422, detail="photo must be a JPEG")
            data["photo_url"] = checked
    merged = current.model_dump()
    merged.update(data)
    return Avatar.model_validate(merged)


def _jpeg_size(data: bytes) -> tuple[int, int]:
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        raise ValueError("photo must be a JPEG")
    index = 2
    while index + 8 < len(data):
        if data[index] != 0xFF:
            raise ValueError("photo must be a JPEG")
        marker = data[index + 1]
        if marker in (0xC0, 0xC1, 0xC2):
            height = int.from_bytes(data[index + 5 : index + 7], "big")
            width = int.from_bytes(data[index + 7 : index + 9], "big")
            return width, height
        if marker == 0x01 or 0xD0 <= marker <= 0xD9:
            index += 2
            continue
        if index + 4 > len(data):
            break
        length = int.from_bytes(data[index + 2 : index + 4], "big")
        if length < 2:
            break
        index += 2 + length
    raise ValueError("photo must be a JPEG")


@router.post("/posts")
def create_post(body: PostBody, request: Request) -> FeedItem:
    runtime = _runtime()
    account = _session(request)
    text = body.text.strip()
    if not 1 <= len(text) <= 500:
        raise HTTPException(status_code=422, detail="a post needs 1 to 500 characters")
    try:
        photo = _check_photo(body.photo_url, 1080, 1080)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if body.drink_id is not None and runtime.catalog.drink(body.drink_id) is None:
        raise HTTPException(status_code=422, detail="drink not found")
    if body.shop_id is not None and runtime.catalog.shop(body.shop_id) is None:
        raise HTTPException(status_code=422, detail="shop not found")
    item = runtime.social.add(
        account["user_id"],
        "post",
        text=text,
        photo_url=photo,
        drink_id=body.drink_id,
        shop_id=body.shop_id,
    )
    return _feed(runtime, item, account["user_id"])


@router.delete("/posts/{item_id}", status_code=204)
def delete_post(item_id: str, request: Request) -> None:
    runtime = _runtime()
    account = _session(request)
    try:
        runtime.social.delete_post(item_id, account["user_id"])
    except KeyError:
        raise HTTPException(status_code=404, detail="post not found") from None
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


def _bestea(runtime, viewer: str, other: str) -> dict:
    return {"user_id": other, "bestea": runtime.social.bestea_status(viewer, other), "besteas": runtime.social.bestea_count(viewer)}


@router.post("/bestea/{ref}/request")
def request_bestea(ref: str, request: Request) -> dict:
    runtime = _runtime()
    account = _session(request)
    other = _resolve(runtime, ref)
    try:
        runtime.social.request_bestea(account["user_id"], other)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _bestea(runtime, account["user_id"], other)


@router.post("/bestea/{ref}/accept")
def accept_bestea(ref: str, request: Request) -> dict:
    runtime = _runtime()
    account = _session(request)
    other = _resolve(runtime, ref)
    try:
        runtime.social.accept_bestea(account["user_id"], other)
    except KeyError:
        raise HTTPException(status_code=404, detail="no bestea request") from None
    return _bestea(runtime, account["user_id"], other)


@router.post("/bestea/{ref}/decline")
def decline_bestea(ref: str, request: Request) -> dict:
    runtime = _runtime()
    account = _session(request)
    other = _resolve(runtime, ref)
    try:
        runtime.social.decline_bestea(account["user_id"], other)
    except KeyError:
        raise HTTPException(status_code=404, detail="no bestea request") from None
    return _bestea(runtime, account["user_id"], other)


@router.delete("/bestea/{ref}")
def end_bestea(ref: str, request: Request) -> dict:
    runtime = _runtime()
    account = _session(request)
    other = _resolve(runtime, ref)
    try:
        runtime.social.end_bestea(account["user_id"], other)
    except KeyError:
        raise HTTPException(status_code=404, detail="no bestea") from None
    return _bestea(runtime, account["user_id"], other)


def _notes(runtime, user_id: str) -> dict:
    items = []
    unread = 0
    for raw in runtime.social.notifications_for(user_id):
        if not raw["read"]:
            unread += 1
        note = Notification(
            id=raw["id"],
            kind=raw["kind"],
            from_user=_author(runtime, raw["from_user"]),
            drink_id=raw.get("drink_id"),
            shop_id=raw.get("shop_id"),
            text=raw.get("text"),
            created_at=raw["created_at"],
            read=raw["read"],
        )
        dumped = note.model_dump(mode="json", by_alias=True, exclude_none=True)
        items.append(dumped)
    return {"items": items, "unread": unread}


@router.get("/notifications")
def get_notifications(request: Request) -> dict:
    runtime = _runtime()
    account = _session(request)
    return _notes(runtime, account["user_id"])


@router.post("/notifications/read")
def read_notifications(body: ReadBody, request: Request) -> dict:
    runtime = _runtime()
    account = _session(request)
    runtime.social.mark_read(account["user_id"], body.ids)
    return _notes(runtime, account["user_id"])
