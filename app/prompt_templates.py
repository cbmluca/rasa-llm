"""Canonical prompt templates and synthetic generator for Tier-5/6 evaluation."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional


@dataclass(frozen=True)
class PromptTemplate:
    intent: str
    action: Optional[str]
    template: str
    slots: Dict[str, List[str]]

    def render(self, rng: random.Random) -> str:
        text = self.template
        for slot, values in (self.slots or {}).items():
            if not values:
                continue
            replacement = rng.choice(values)
            text = text.replace(f"{{{slot}}}", replacement)
        return text


_DEFAULT_TEMPLATES: List[PromptTemplate] = [
    PromptTemplate(
        intent="todo_list",
        action="create",
        template="Add a todo called \"{title}\" due {date}",
        slots={
            "title": ["file taxes", "buy milk", "clean the kitchen"],
            "date": ["tomorrow", "next Monday", "on Friday"],
        },
    ),
    PromptTemplate(
        intent="todo_list",
        action="update",
        template="Mark \"{title}\" as completed",
        slots={"title": ["buy milk", "update roadmap", "send invoice"]},
    ),
    PromptTemplate(
        intent="calendar_edit",
        action="create",
        template="Schedule \"{title}\" on {date} at {time} with location {location}",
        slots={
            "title": ["Design sync", "Sprint retro", "Budget review"],
            "date": ["next Tuesday", "Jan 5", "March 12"],
            "time": ["10am", "14:30", "9 in the morning"],
            "location": ["HQ", "Zoom", "Room 3"],
        },
    ),
    PromptTemplate(
        intent="calendar_edit",
        action="list",
        template="List my upcoming meetings",
        slots={},
    ),
    PromptTemplate(
        intent="kitchen_tips",
        action="search",
        template="Give me kitchen tips about {topic}",
        slots={"topic": ["cast iron", "pasta", "baking"]},
    ),
    PromptTemplate(
        intent="news",
        action=None,
        template="What are the latest news about {topic}?",
        slots={"topic": ["AI regulation", "sports", "space"]},
    ),
    PromptTemplate(
        intent="weather",
        action=None,
        template="What's the weather like in {city} tomorrow?",
        slots={"city": ["Copenhagen", "Berlin", "New York"]},
    ),
]


def generate_prompts(
    templates: Optional[Iterable[PromptTemplate]] = None,
    *,
    variations: int = 3,
    seed: Optional[int] = 42,
) -> List[Dict[str, Optional[str]]]:
    """Return synthetic prompts plus their expected intent/action."""

    rng = random.Random(seed)
    templates = list(templates or _DEFAULT_TEMPLATES)
    outputs: List[Dict[str, Optional[str]]] = []
    for template in templates:
        for _ in range(max(1, variations)):
            prompt = template.render(rng)
            outputs.append(
                {
                    "prompt": prompt,
                    "expected_intent": template.intent,
                    "expected_action": template.action,
                }
            )
    return outputs


__all__ = ["PromptTemplate", "generate_prompts"]
