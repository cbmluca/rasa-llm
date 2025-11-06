"""Route Tier-1 messages through the LLM when heuristics cannot decide.

The router prompts an LLM to choose between direct assistant responses and
tool invocations. By encapsulating prompt assembly and response parsing, the
module documents how Tier-1 stays auditable even when decisions are outsourced
to the language model.
"""

from __future__ import annotations

import json
from typing import Iterable, Union


class LLMRouter:
    """Delegates routing decisions to an OpenAI model."""

    def __init__(self, model: str, api_key: str | None, enabled_tools: Iterable[str]):
        self._model = model
        self._api_key = api_key
        self._enabled_tools = tuple(enabled_tools)

    # --- Prompt construction: tell the LLM the contract before asking for help
    def _build_prompt(self, message: str) -> str:
        tools = "\n".join(f"- {name}" for name in self._enabled_tools) or "(no tools enabled)"
        return (
            "You are a router for a Rasa-based assistant.\n"
            "When the user message is best handled by a tool, respond with JSON like\n"
            '{"type": "tool", "name": "tool_name", "payload": {...}}.\n'
            "If you want to respond directly, return plain text.\n"
            f"Available tools:\n{tools}\n"
            f"User: {message}"
        )

    # --- Response parsing: prefer structured instructions but fall back to text
    def _parse_response(self, content: str) -> Union[str, dict]:
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            return content.strip()

        if isinstance(data, dict) and data.get("type") == "tool":
            return data
        return content.strip()

    def route(self, message: str) -> Union[str, dict]:
        if not self._api_key:
            return "LLM routing is not configured."

        # --- Dependency guard: fail fast when OpenAI SDK is unavailable
        try:
            import openai
        except ImportError:
            return "LLM routing unavailable: OpenAI package is not installed."

        prompt = self._build_prompt(message)
        openai.api_key = self._api_key

        # --- Remote call: capture API failures so Tier-1 falls back gracefully
        try:
            response = openai.ChatCompletion.create(
                model=self._model,
                messages=[{"role": "system", "content": "You are a tool router."}, {"role": "user", "content": prompt}],
                temperature=0.0,
            )
        except Exception as exc:  # pragma: no cover - network/credentials issues
            return f"LLM routing failed: {exc}"  # return text fallback

        content = response["choices"][0]["message"]["content"]
        return self._parse_response(content)