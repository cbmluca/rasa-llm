from __future__ import annotations

import os
from typing import Dict, Iterable, List


_DEFAULT_NLU_THRESHOLD: float = 0.65
_DEFAULT_LLM_MODEL: str = "gpt-4o-mini"
_ENABLED_TOOLS: List[str] = ["weather", "news"]


def get_nlu_threshold() -> float:
    """Return the confidence threshold used by the rule-based NLU."""

    return _DEFAULT_NLU_THRESHOLD


def get_llm_model() -> str:
    """Return the model identifier used by the LLM router."""

    return _DEFAULT_LLM_MODEL


def get_enabled_tools() -> Iterable[str]:
    """Return the names of tools that can be called by the LLM router."""

    return tuple(_ENABLED_TOOLS)


def get_llm_api_key(env: Dict[str, str] | None = None) -> str | None:
    """Return the API key for the LLM service.

    Args:
        env: Optional mapping used instead of ``os.environ`` to simplify testing.

    Returns:
        The API key string if present, otherwise ``None``.
    """

    source = env if env is not None else os.environ
    return source.get("OPENAI_API_KEY")