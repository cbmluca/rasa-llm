from app.prompt_templates import generate_prompts, PromptTemplate


def test_generate_prompts_variations() -> None:
    custom = [
        PromptTemplate(intent="todo_list", action="create", template="Add {item}", slots={"item": ["milk", "bread"]})
    ]
    prompts = generate_prompts(custom, variations=2, seed=1)
    assert len(prompts) == 2
    assert prompts[0]["expected_intent"] == "todo_list"
    assert prompts[0]["expected_action"] == "create"
    assert prompts[0]["prompt"].startswith("Add ")
