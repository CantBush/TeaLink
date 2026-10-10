"""Social routes: sign-up, the onboarding quiz, profiles, follows, and the feed.

Mounted after the routes in ``main`` so ``/users/similar`` keeps matching
first. Nothing here changes how the agents deliberate, except that a quiz
gives a new user their own taste profile and starting priorities.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from tealink.agents.scoring import user_profile
from tealink.core import quiz as quiz_core
from tealink.core.preferences import PRIOR, normalize
from tealink.core.similarity import cosine_similarity
from tealink.core.stats import boba_stats
from tealink.schemas import (
    STAT_FIELDS,
    Avatar,
    BobaStats,
    DeliberationRequest,
    FeedItem,
    QuizResult,
    StatKey,
    User,
    UserProfile,
)
from tealink.social.store import MAX_BIO, MAX_COMMENT, QuizRecord, parse_time

router = APIRouter()

ACTIVITY_KINDS = {"review", "pick", "rec"}


class NewUser(BaseModel):
    handle: str
    display_name: str = ""


class QuizAnswers(BaseModel):
    user_id: str
    answers: dict[str, str | list[str]]


class ProfilePatch(BaseModel):
    handle: str | None = None
    display_name: str | None = Field(default=None, max_length=40)
    bio: str | None = Field(default=None, max_length=MAX_BIO)
    avatar: Avatar | None = None
    accent: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    pinned_drink_id: str | None = None
    pinned_shop_id: str | None = None
    visible_stats: list[StatKey] | None = None


class Viewer(BaseModel):
    viewer: str


class Actor(BaseModel):
    user_id: str


class CommentBody(BaseModel):
    user_id: str
    text: str = Field(max_length=MAX_COMMENT)


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
    """What the Preference agent believes now: quiz prior plus every pick."""
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
    return boba_stats(
        runtime.catalog,
        user_id,
        profile=user_profile(runtime.catalog, user_id),
        weights=await current_weights(runtime, user_id),
        picks=runtime.social.picks(user_id),
        activity=activity,
        now=datetime.now(UTC),
        quiz_toppings=record.toppings if record else None,
        quiz_shop_id=record.fav_shop_id if record else None,
    )


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
    return UserProfile(
        user_id=user_id,
        handle=settings.handle,
        display_name=settings.display_name,
        bio=settings.bio,
        avatar=settings.avatar,
        accent=settings.accent,
        pinned_drink_id=settings.pinned_drink_id,
        pinned_shop_id=settings.pinned_shop_id,
        visible_stats=list(settings.visible_stats),
        followers=len(runtime.social.followers(user_id)),
        following=len(runtime.social.following(user_id)),
        followed_by_me=runtime.social.is_following(viewer, user_id),
        taste_match=taste_match(runtime, viewer, user_id),
        stats=shown,
    )


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
def get_quiz() -> dict:
    runtime = _runtime()
    return {"questions": [question.model_dump(mode="json") for question in quiz_core.questions(runtime.catalog.shops)]}


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


@router.post("/quiz")
async def take_quiz(body: QuizAnswers) -> QuizResult:
    runtime = _runtime()
    user_id = _require(runtime, body.user_id)
    try:
        outcome = quiz_core.score(body.answers, runtime.catalog.shops)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    runtime.catalog.set_base_profile(user_id, outcome.profile)
    runtime.social.quiz[user_id] = QuizRecord(
        weights=outcome.weights,
        profile=outcome.profile,
        toppings=outcome.toppings,
        fav_shop_id=outcome.fav_shop_id,
    )
    settings = runtime.social.profile(user_id)
    if settings.pinned_shop_id is None and outcome.fav_shop_id is not None:
        settings.pinned_shop_id = outcome.fav_shop_id
    stats = await compute_stats(runtime, user_id)
    return QuizResult(user_id=user_id, personality=stats.personality, stats=stats, weights=stats.priorities)


# Profiles and follows


@router.get("/users")
def list_users(viewer: str | None = None) -> dict:
    runtime = _runtime()
    viewer = _known(runtime, viewer)
    return {"users": [_summary(runtime, user.id, viewer) for user in runtime.catalog.users]}


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
    if "avatar" in changes:
        changes["avatar"] = Avatar.model_validate(changes["avatar"])
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
def feed(user_id: str, limit: int = 50) -> dict:
    runtime = _runtime()
    viewer = _require(runtime, user_id)
    limit = max(1, min(limit, 200))
    return {"items": [item.view(viewer).model_dump(mode="json") for item in runtime.social.feed_for(viewer, limit)]}


def _feed_item(runtime, item_id: str):
    item = runtime.social.feed.get(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="feed item not found")
    return item


@router.post("/feed/{item_id}/like")
def like(item_id: str, body: Actor) -> FeedItem:
    runtime = _runtime()
    user_id = _require(runtime, body.user_id)
    _feed_item(runtime, item_id)
    return runtime.social.like(item_id, user_id).view(user_id)


@router.delete("/feed/{item_id}/like")
def unlike(item_id: str, body: Actor) -> FeedItem:
    runtime = _runtime()
    user_id = _require(runtime, body.user_id)
    _feed_item(runtime, item_id)
    return runtime.social.unlike(item_id, user_id).view(user_id)


@router.post("/feed/{item_id}/comments")
def comment(item_id: str, body: CommentBody) -> FeedItem:
    runtime = _runtime()
    user_id = _require(runtime, body.user_id)
    _feed_item(runtime, item_id)
    try:
        item = runtime.social.comment(item_id, user_id, body.text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return item.view(user_id)


@router.post("/recs")
def send_rec(body: RecBody) -> FeedItem:
    runtime = _runtime()
    sender = _require(runtime, body.from_user)
    receiver = _require(runtime, body.to)
    if sender == receiver:
        raise HTTPException(status_code=422, detail="send recs to someone else")
    if runtime.catalog.drink(body.drink_id) is None:
        raise HTTPException(status_code=422, detail="drink not found")
    item = runtime.social.add(sender, "rec", drink_id=body.drink_id, text=body.text.strip() or None, to_user_id=receiver)
    return item.view(sender)
