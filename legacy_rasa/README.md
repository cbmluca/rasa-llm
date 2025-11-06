# Legacy Rasa Project

This directory archives the original Rasa configuration, training data, and
custom actions that shipped with the project. The active Tier-1 assistant now
implements its NLU, routing, and tool logic entirely in the Python modules
under `app/`, `core/`, and `tools/`.

If you ever need to resurrect the classic Rasa stack, move these files back to
their previous locations (`actions/`, `data/`, `domain.yml`, etc.) or create a
fresh Rasa project and copy over the relevant pieces.
