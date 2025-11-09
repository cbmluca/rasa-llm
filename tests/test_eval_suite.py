from types import SimpleNamespace

from app.eval_suite import EvalCase, evaluate_cases


class StubResponse:
    def __init__(self, intent: str, action: str | None) -> None:
        self.nlu_result = SimpleNamespace(intent=intent)
        self.tool_payload = {"action": action} if action else {}
        self.tool_result = None


class StubOrchestrator:
    def __init__(self, mapping: dict[str, tuple[str, str | None]]) -> None:
        self.mapping = mapping

    def handle_message_with_details(self, prompt: str) -> StubResponse:
        intent, action = self.mapping.get(prompt, ("nlu_fallback", None))
        return StubResponse(intent, action)


def test_evaluate_cases_counts_accuracy() -> None:
    prompts = [
        EvalCase(prompt="todo", expected_intent="todo_list", expected_action="create"),
        EvalCase(prompt="calendar", expected_intent="calendar_edit", expected_action="create"),
    ]
    orchestrator = StubOrchestrator({
        "todo": ("todo_list", "create"),
        "calendar": ("calendar_edit", "update"),
    })
    results = evaluate_cases(orchestrator, prompts)
    assert results["total"] == 2
    assert results["intent_accuracy"] == 1.0  # both intents match
    assert results["action_accuracy"] == 0.5
    assert len(results["mismatches"]) == 1
