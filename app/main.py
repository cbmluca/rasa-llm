"""Assemble the orchestrator and run the interactive CLI loop."""

from __future__ import annotations

from app.config import (
    get_enabled_tools,
    get_llm_api_key,
    get_llm_model,
    get_nlu_threshold,
    get_review_queue_path,
    get_turn_log_path,
    get_log_max_bytes,
    get_log_backup_count,
    get_log_redaction_patterns,
    is_log_redaction_enabled,
    is_logging_enabled,
)
from core.learning_logger import LearningLogger
from core.llm_router import LLMRouter
from core.nlu_service import NLUService
from core.orchestrator import Orchestrator
from core.tool_registry import ToolRegistry
from tools import load_all_core_tools

# -- Orchestrator construction -------------------------------------------------
def build_orchestrator() -> Orchestrator:
    nlu = NLUService(get_nlu_threshold())
    registry = ToolRegistry()
    load_all_core_tools(registry)

    router = LLMRouter(
        model=get_llm_model(),
        api_key=get_llm_api_key(),
        enabled_tools=get_enabled_tools(),
    )

    logger = LearningLogger(
        turn_log_path=get_turn_log_path(),
        review_log_path=get_review_queue_path(),
        enabled=is_logging_enabled(),
        redact=is_log_redaction_enabled(),
        patterns=get_log_redaction_patterns(),
        max_bytes=get_log_max_bytes(),
        backup_count=get_log_backup_count(),
    )

    return Orchestrator(nlu=nlu, registry=registry, router=router, logger=logger)

# -- Interactive CLI loop ------------------------------------------------------
def main() -> None:
    orchestrator = build_orchestrator()
    print("Tier 1 assistant ready. Type 'quit' or 'exit' to stop.")

    while True:
        try:
            message = input("You: ")
        except (EOFError, KeyboardInterrupt):
            print("\nExiting.")
            break

        if message.strip().lower() in {"quit", "exit"}:
            print("Goodbye!")
            break

        response = orchestrator.handle_message(message)
        print()
        print(f"Assistant: {response}")
        print()


if __name__ == "__main__":
    main()
