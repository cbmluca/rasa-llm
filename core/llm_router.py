"""Route Tier-1 messages through the LLM when heuristics cannot decide.

The router prompts an LLM to choose between direct assistant responses and
tool invocations. By encapsulating prompt assembly and response parsing, the
module documents how Tier-1 stays auditable even when decisions are outsourced
to the language model.
"""

from __future__ import annotations

import json
from typing import Iterable, Union, List, Dict, Tuple


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
            "Always respond with JSON.\n"
            "If a tool should be called, reply with {\"type\": \"tool\", \"name\": \"tool_name\", \"payload\": {...}}.\n"
            "If no tool applies, reply with {\"type\": \"none\"}.\n"
            f"Available tools:\n{tools}\n"
            f"User: {message}"
        )

    # --- Response parsing: prefer structured instructions but fall back to text
    def _parse_response(self, content: str) -> Dict[str, object]:
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            return {"type": "text", "content": content.strip()}

        if isinstance(data, dict):
            dtype = data.get("type")
            if dtype == "tool":
                payload = data.get("payload") or {}
                if not isinstance(payload, dict):
                    payload = {}
                return {
                    "type": "tool",
                    "name": str(data.get("name", "")).strip(),
                    "payload": payload,
                }
            if dtype in {"none", "no_tool"}:
                return {"type": "none"}

        return {"type": "text", "content": content.strip()}

    def route(self, message: str) -> Union[str, Dict[str, object]]:
        prompt = self._build_prompt(message)
        content, error = self._chat_completion(
            messages=[
                {"role": "system", "content": "You only decide which tool should run."},
                {"role": "user", "content": prompt},
            ],
            label="LLM routing",
            temperature=0.0,
        )
        if error:
            if "not configured" in error.lower():
                return (
                    "ChatGPT fallback requires an OPENAI_API_KEY environment variable. "
                    "Set it to receive 'From ChatGPT' answers."
                )
            return error
        if content is None:
            return "LLM routing returned no content."
        return self._parse_response(content)

    def suggest_tool(self, message: str) -> str | None:
        """Ask the LLM to suggest a single tool even if it wouldn't normally run one."""

        tools = ", ".join(self._enabled_tools) or "none"
        prompt = (
            "Based on the user prompt, choose the single most relevant tool name from this list "
            f"({tools}) or return \"none\" if none apply.\n"
            "Respond with JSON like {\"tool\": \"name\"}."
        )
        content, error = self._chat_completion(
            messages=[
                {"role": "system", "content": "You classify prompts into tool names."},
                {"role": "user", "content": f"{prompt}\nUser: {message}"},
            ],
            label="Tool suggestion",
            temperature=0.1,
        )
        if error or not content:
            return None
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            return None
        tool = data.get("tool")
        if isinstance(tool, str):
            value = tool.strip()
            if value and value.lower() != "none":
                return value
        return None

    def general_answer(self, message: str) -> str:
        content, error = self._chat_completion(
            messages=[
                {"role": "system", "content": "You are ChatGPT helping a user after routing failed."},
                {"role": "user", "content": message},
            ],
            label="ChatGPT fallback",
            temperature=0.2,
        )
        if error:
            return error
        if not content:
            return "ChatGPT fallback returned an empty response."
        return f"From ChatGPT: {content.strip()}"

    # --- Shared OpenAI helper ------------------------------------------------
    def _chat_completion(
        self,
        messages: List[Dict[str, str]],
        label: str,
        temperature: float,
    ) -> Tuple[str | None, str | None]:
        if not self._api_key:
            return None, f"{label} is not configured."

        try:
            from openai import OpenAI
        except ImportError:
            return None, f"{label} unavailable: OpenAI package is not installed."

        client = OpenAI(api_key=self._api_key)

        try:
            response = client.chat.completions.create(
                model=self._model,
                messages=messages,
                temperature=temperature,
            )
        except Exception as exc:  # pragma: no cover - network/credentials issues
            return None, f"{label} failed: {exc}"

        choice = response.choices[0]
        content = getattr(choice.message, "content", None)
        return content, None
