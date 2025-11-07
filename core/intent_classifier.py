"""Runtime helper for loading and querying the Tier-4 intent classifier."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

try:
    import joblib
except Exception:  # pragma: no cover - optional dependency at runtime
    joblib = None  # type: ignore


@dataclass
class ClassifierPrediction:
    intent: str
    confidence: float


class IntentClassifier:
    """Lazy loader for the scikit-learn classifier pickle."""

    def __init__(self, model_path: Path | str) -> None:
        self._model_path = Path(model_path)
        self._model = None

    def _load_model(self):
        if self._model is not None:
            return self._model
        if joblib is None or not self._model_path.exists():
            return None
        model = joblib.load(self._model_path)
        self._model = model
        return model

    def predict(self, text: str) -> Optional[ClassifierPrediction]:
        if not text or not text.strip():
            return None
        model = self._load_model()
        if model is None:
            return None
        text_batch = [text]
        proba_method = getattr(model, "predict_proba", None)
        classes = getattr(model, "classes_", None)

        if callable(proba_method) and classes is not None:
            probabilities = proba_method(text_batch)[0]
            values = list(probabilities)
            idx = max(range(len(values)), key=values.__getitem__)
            intent = str(classes[idx])
            confidence = float(values[idx])
            return ClassifierPrediction(intent=intent, confidence=confidence)

        predictions = getattr(model, "predict")(text_batch)
        predicted = str(predictions[0])
        return ClassifierPrediction(intent=predicted, confidence=0.0)


__all__ = ["ClassifierPrediction", "IntentClassifier"]
