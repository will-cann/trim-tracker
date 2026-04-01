"""Area 2: Intent classification accuracy.

Tests that each transcript chunk is classified to the correct workflow type
and produces the expected action types.
"""

from __future__ import annotations

import json

import pytest

from .config import DATASETS_DIR
from .report import EvalResult
from .scoring import score_intent
from .schemas import ACTION_TO_WORKFLOW


def _load_cases() -> list[dict]:
    path = DATASETS_DIR / "intent_classification.json"
    data = json.loads(path.read_text())
    return data["cases"]


def _load_contexts() -> dict:
    path = DATASETS_DIR / "contexts.json"
    return json.loads(path.read_text())


CASES = _load_cases()
CONTEXTS = _load_contexts()


def _build_context(case: dict) -> dict:
    ctx = CONTEXTS.get(case.get("context_key", "default"), CONTEXTS["default"]).copy()
    if "context_override" in case:
        ctx.update(case["context_override"])
    return ctx


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_intent_classification(case, api_client, report_collector):
    """Test that the AI classifies the input to the correct action type(s)."""
    context = _build_context(case)
    expected = case["expected"]
    expected_types = expected["action_types"]
    expected_workflow = expected.get("primary_workflow")

    response = api_client.parse(
        transcript_chunks=[case["input"]],
        context=context,
    )

    actions = response.get("actions", [])
    predicted_types = [a["type"] for a in actions]

    # Score intent (action types)
    intent_score = score_intent(predicted_types, expected_types)

    # Check workflow category
    predicted_workflows = set()
    for t in predicted_types:
        wf = ACTION_TO_WORKFLOW.get(t)
        if wf:
            predicted_workflows.add(wf)

    workflow_match = expected_workflow in predicted_workflows if expected_workflow else True

    # A test passes if intent score >= 0.5 (at least partial match)
    passed = intent_score >= 0.5

    report_collector.add(EvalResult(
        test_id=case["id"],
        area="intent",
        passed=passed,
        score=intent_score,
        details={
            "input": case["input"],
            "expected_types": expected_types,
            "predicted_types": predicted_types,
            "expected_workflow": expected_workflow,
            "predicted_workflows": list(predicted_workflows),
            "workflow_match": workflow_match,
            "tags": case.get("tags", []),
        },
    ))

    assert passed, (
        f"Intent score {intent_score:.2f} < 0.5 — "
        f"expected {expected_types}, got {predicted_types}"
    )
