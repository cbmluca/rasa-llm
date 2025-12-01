"""Authentication helpers for Tier-5 login/session management."""

from __future__ import annotations

import secrets
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, Iterable, Mapping, Optional, Sequence, Set

from core.json_storage import atomic_write_json, read_json

SESSION_COOKIE_NAME = "tier5_user_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 4
USER_QUOTA_PATH = Path("data_pipeline/user_quota.json")
DEFAULT_ADMIN_USERNAME = "LCBM"
_PASSWORD_SALT = "tier5-login"


@dataclass(frozen=True)
class UserRecord:
    username: str
    password_hash: str
    roles: Set[str]
    token: str
    daily_prompt_limit: Optional[int]

    def is_admin(self) -> bool:
        return "admin" in self.roles


class QuotaExceededError(Exception):
    """Raised when a user exceeds their daily prompt allocation."""

    def __init__(self, username: str, limit: int) -> None:
        super().__init__(f"User '{username}' exceeded their {limit}-prompt daily quota.")
        self.username = username
        self.limit = limit


def _hash_password(username: str, raw_password: str) -> str:
    payload = f"{_PASSWORD_SALT}:{username}:{raw_password}".encode("utf-8")
    return __import__("hashlib").sha256(payload).hexdigest()


def _build_user_record(username: str, password: str, roles: Iterable[str], token: str, quota: Optional[int]) -> UserRecord:
    return UserRecord(
        username=username,
        password_hash=_hash_password(username, password),
        roles=set(roles),
        token=token,
        daily_prompt_limit=quota,
    )


_USER_DEFINITIONS: Sequence[UserRecord] = [
    _build_user_record("LCBM", "testing123", roles=["admin"], token="LCBM", quota=None),
    _build_user_record("test1", "test1", roles=["reviewer"], token="test1", quota=25),
    _build_user_record("test2", "test2", roles=["reviewer"], token="test2", quota=25),
    _build_user_record("test3", "test3", roles=["reviewer"], token="test3", quota=25),
]

# TODO: make this pluggable/via config in later tiers.
USER_CATALOG: Dict[str, UserRecord] = {user.username: user for user in _USER_DEFINITIONS}


def authenticate(username: str, password: str) -> Optional[UserRecord]:
    """Return a user record when the credentials match."""

    user = USER_CATALOG.get(username)
    if not user:
        return None
    if user.password_hash != _hash_password(username, password):
        return None
    return user


def get_user(username: str) -> Optional[UserRecord]:
    """Return the catalog entry for ``username``."""

    return USER_CATALOG.get(username)


class SessionManager:
    """In-memory session index (cookie token -> username)."""

    def __init__(self) -> None:
        self._sessions: Dict[str, str] = {}
        self._lock = threading.Lock()

    def create_session(self, username: str) -> str:
        token = secrets.token_urlsafe(32)
        with self._lock:
            self._sessions[token] = username
        return token

    def get_user(self, token: str) -> Optional[UserRecord]:
        with self._lock:
            username = self._sessions.get(token)
        if not username:
            return None
        return USER_CATALOG.get(username)

    def destroy_session(self, token: str) -> None:
        with self._lock:
            self._sessions.pop(token, None)


class QuotaManager:
    """Track daily prompt counts per user with atomic JSON writes."""

    def __init__(self, path: Path | None = None) -> None:
        self._path = path or USER_QUOTA_PATH

    def _load(self) -> Dict[str, Dict[str, int]]:
        return read_json(self._path, {})

    def _save(self, data: Dict[str, Dict[str, int]]) -> None:
        atomic_write_json(self._path, data)

    def _today(self) -> str:
        return datetime.now(tz=timezone.utc).date().isoformat()

    def consume_prompt(self, user: UserRecord) -> None:
        if user.daily_prompt_limit is None:
            return
        data = self._load()
        today = self._today()
        counts = data.setdefault(today, {})
        current = counts.get(user.username, 0)
        limit = user.daily_prompt_limit
        if current >= limit:
            raise QuotaExceededError(user.username, limit)
        counts[user.username] = current + 1
        self._save(data)

    def get_usage(self, user: UserRecord) -> Dict[str, Optional[int]]:
        data = self._load()
        today = self._today()
        used = data.get(today, {}).get(user.username, 0)
        return {
            "date": today,
            "used": used,
            "limit": user.daily_prompt_limit,
            "remaining": None if user.daily_prompt_limit is None else max(user.daily_prompt_limit - used, 0),
        }


def record_owner(record: Mapping[str, object]) -> str:
    """Return the username associated with a pending/training/corrected entry."""

    if owner := record.get("user_id"):
        return str(owner)
    if reviewer := record.get("reviewer_id"):
        return str(reviewer)
    if metadata := record.get("extras"):
        user_field = metadata.get("user_id") if isinstance(metadata, dict) else None
        if user_field:
            return str(user_field)
    return DEFAULT_ADMIN_USERNAME


__all__ = [
    "QuotaExceededError",
    "QuotaManager",
    "SessionManager",
    "UserRecord",
    "authenticate",
    "get_user",
    "record_owner",
    "SESSION_COOKIE_NAME",
    "SESSION_MAX_AGE_SECONDS",
    "DEFAULT_ADMIN_USERNAME",
]
