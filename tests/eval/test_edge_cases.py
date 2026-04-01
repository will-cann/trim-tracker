"""Area 5: Edge case evaluation.

Tests self-corrections, multiple actions in one breath,
mumbled/unclear input, and ambiguous units.
"""

from __future__ import annotations

import json

import pytest

from .config import DATASETS_DIR
from .report import EvalResult
from .scoring import score_pipeline


def _load_cases() -> list[dict]:
    path = DATASETS_DIR / "edge_cases.json"
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
def test_edge_case(case, api_client, report_collector):
    """Test edge case handling."""
    context = _build_context(case)
    expected_actions = case.get("expected_actions", [])
    accept_clarification = case.get("accept_clarification", False)

    response = api_client.parse(
        transcript_chunks=[case["input"]],
        context=context,
    )

    actions = response.get("actions", [])
    message = response.get("message", "")

    # For cases that accept clarification as a valid response
    if accept_clarification and not actions and message:
        # AI asked for clarification instead of guessing — this is correct
        report_collector.add(EvalResult(
            test_id=case["id"],
            area="edge",
            passed=True,
            score=1.0,
            details={
                "input": case["input"],
                "outcome": "clarification_requested",
                "message": message,
                "tags": case.get("tags", []),
            },
        ))
        return

    if not expected_actions:
        # Expected no actions and got none (or clarification)
        passed = len(actions) == 0 or bool(message)
        report_collector.add(EvalResult(
            test_id=case["id"],
            area="edge",
            passed=passed,
            score=1.0 if passed else 0.0,
            details={
                "input": case["input"],
                "outcome": "no_action_expected",
                "got_actions": len(actions),
                "got_message": bool(message),
                "tags": case.get("tags", []),
            },
        ))
        assert passed, f"Expected no actions or clarification, got {len(actions)} actions"
        return

    # Score against expected actions
    predicted = [{"type": a["type"], "data": a.get("data", {})} for a in actions]
    pipeline_score = score_pipeline(predicted, expected_actions)

    # Edge cases get a more lenient threshold (0.4) since they're intentionally hard
    passed = pipeline_score.f1 >= 0.4

    report_collector.add(EvalResult(
        test_id=case["id"],
        area="edge",
        passed=passed,
        score=pipeline_score.f1,
        details={
            "input": case["input"],
            "expected_action_count": len(expected_actions),
            "predicted_action_count": len(actions),
            "pipeline_f1": pipeline_score.f1,
            "precision": pipeline_score.precision,
            "recall": pipeline_score.recall,
            "predicted_types": [a["type"] for a in actions],
            "expected_types": [a["type"] for a in expected_actions],
            "tags": case.get("tags", []),
            "notes": case.get("notes", ""),
        },
    ))

    assert passed, (
        f"Edge case F1 {pipeline_score.f1:.2f} < 0.4 — "
        f"expected {[a['type'] for a in expected_actions]}, "
        f"got {[a['type'] for a in actions]}"
    )
