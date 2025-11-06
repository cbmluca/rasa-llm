"""Centralize defaults and environment lookups for the orchestrator."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Iterable, List

try:
    from dotenv import load_dotenv  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    load_dotenv = None
else:
    load_dotenv()

# ---------------------------------------------------------------------------
# Default configuration values
# ---------------------------------------------------------------------------
_DEFAULT_NLU_THRESHOLD: float = 0.65
_DEFAULT_LLM_MODEL: str = "gpt-4o-mini"
_ENABLED_TOOLS: List[str] = ["weather", "news"]
_DEFAULT_LOGGING_ENABLED: bool = True
_DEFAULT_LOG_REDACTION_ENABLED: bool = True
_DEFAULT_LOG_DIR = "logs"
_DEFAULT_REVIEW_QUEUE_DIR = "data_pipeline/nlu_training_bucket"
_TURN_LOG_FILENAME = "turns.jsonl"
_REVIEW_QUEUE_FILENAME = "pending.jsonl"
_DEFAULT_LOG_REDACTION_PATTERNS = "email,phone,credit_card,gov_id,url"
_DEFAULT_LOG_MAX_BYTES = 1_000_000
_DEFAULT_LOG_BACKUP_COUNT = 5

# ---------------------------------------------------------------------------
# Accessors for static defaults
# ---------------------------------------------------------------------------
def get_nlu_threshold() -> float:
    """Return the confidence threshold used by the rule-based NLU."""

    return _DEFAULT_NLU_THRESHOLD

def get_llm_model() -> str:
    """Return the model identifier used by the LLM router."""

    return _DEFAULT_LLM_MODEL

def get_enabled_tools() -> Iterable[str]:
    """Return the names of tools that can be called by the LLM router."""

    return tuple(_ENABLED_TOOLS)

# ---------------------------------------------------------------------------
# Environment-derived settings
# ---------------------------------------------------------------------------
def get_llm_api_key(env: Dict[str, str] | None = None) -> str | None:
    """Return the API key for the LLM service.

    Args:
        env: Optional mapping used instead of ``os.environ`` to simplify testing.

    Returns:
        The API key string if present, otherwise ``None``.
    """

    source = env if env is not None else os.environ
    return source.get("OPENAI_API_KEY")


def is_logging_enabled(env: Dict[str, str] | None = None) -> bool:
    """Determine whether Tier-2 logging is active."""

    source = env if env is not None else os.environ
    raw = source.get("LOGGING_ENABLED")
    if raw is None:
        return _DEFAULT_LOGGING_ENABLED

    normalized = raw.strip().lower()
    if normalized in {"0", "false", "no", "off"}:
        return False
    if normalized in {"1", "true", "yes", "on"}:
        return True
    return _DEFAULT_LOGGING_ENABLED


def get_log_dir(env: Dict[str, str] | None = None) -> Path:
    """Return the base directory for turn-by-turn logs."""

    source = env if env is not None else os.environ
    override = source.get("LOG_DIR")
    return Path(override) if override else Path(_DEFAULT_LOG_DIR)


def get_turn_log_path(env: Dict[str, str] | None = None) -> Path:
    """Return the full path for the turn log JSONL file."""

    return get_log_dir(env) / _TURN_LOG_FILENAME


def get_review_queue_dir(env: Dict[str, str] | None = None) -> Path:
    """Return the base directory for the review queue file."""

    source = env if env is not None else os.environ
    override = source.get("REVIEW_QUEUE_DIR")
    return Path(override) if override else Path(_DEFAULT_REVIEW_QUEUE_DIR)


def get_review_queue_path(env: Dict[str, str] | None = None) -> Path:
    """Return the full path for the review queue JSONL file."""

    return get_review_queue_dir(env) / _REVIEW_QUEUE_FILENAME


def is_log_redaction_enabled(env: Dict[str, str] | None = None) -> bool:
    """Determine whether sensitive values should be scrubbed before logging."""

    source = env if env is not None else os.environ
    raw = source.get("LOG_REDACTION_ENABLED")
    if raw is None:
        return _DEFAULT_LOG_REDACTION_ENABLED

    normalized = raw.strip().lower()
    if normalized in {"0", "false", "no", "off"}:
        return False
    if normalized in {"1", "true", "yes", "on"}:
        return True
    return _DEFAULT_LOG_REDACTION_ENABLED


def get_log_redaction_patterns(env: Dict[str, str] | None = None) -> List[str]:
    """Return the list of redaction pattern keys to apply."""

    source = env if env is not None else os.environ
    raw = source.get("LOG_REDACTION_PATTERNS")
    values = raw if raw is not None else _DEFAULT_LOG_REDACTION_PATTERNS
    parts = [segment.strip().lower() for segment in values.split(",") if segment.strip()]
    return [part for part in parts if part]


def get_log_max_bytes(env: Dict[str, str] | None = None) -> int:
    """Return the maximum size in bytes before rotating log files."""

    source = env if env is not None else os.environ
    raw = source.get("LOG_MAX_BYTES")
    if raw is None:
        return _DEFAULT_LOG_MAX_BYTES
    try:
        value = int(raw)
    except ValueError:
        return _DEFAULT_LOG_MAX_BYTES
    return max(value, 0)


def get_log_backup_count(env: Dict[str, str] | None = None) -> int:
    """Return the number of rotated log files to retain."""

    source = env if env is not None else os.environ
    raw = source.get("LOG_BACKUP_COUNT")
    if raw is None:
        return _DEFAULT_LOG_BACKUP_COUNT
    try:
        value = int(raw)
    except ValueError:
        return _DEFAULT_LOG_BACKUP_COUNT
    return max(value, 0)
