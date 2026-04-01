"""Area 3: Entity extraction accuracy.

Tests that Claude correctly extracts field values (batch IDs, strain names,
weights, units, times, personnel, locations) from voice transcripts.
"""

from __future__ import annotations

import json

import pytest

from .config import DATASETS_DIR
from .report import EvalResult
from .scoring import score_action, score_pipeline


def _load_cases() -> list[dict]:
    path = DATASETS_DIR / "entity_extraction.json"
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
def test_entity_extraction(case, api_client, report_collector):
    """Test per-field extraction accuracy."""
    context = _build_context(case)
    expected_actions = case["expected_actions"]

    response = api_client.parse(
        transcript_chunks=[case["input"]],
        context=context,
    )

    actions = response.get("actions", [])

    # Build predicted action list in the format score_pipeline expects
    predicted = [{"type": a["type"], "data": a.get("data", {})} for a in actions]

    pipeline_score = score_pipeline(predicted, expected_actions)

    # Per-field details
    field_details = []
    for action_score in pipeline_score.per_action:
        for fs in action_score.field_scores:
            field_details.append({
                "field": fs.field_name,
                "match": fs.match,
                "similarity": fs.similarity,
                "detail": fs.detail,
            })

    # Pass if F1 >= 0.5 AND at least half the field scores match
    field_match_rate = (
        sum(1 for d in field_details if d["match"]) / len(field_details)
        if field_details else 1.0
    )
    overall = (pipeline_score.f1 + field_match_rate) / 2
    passed = overall >= 0.5

    report_collector.add(EvalResult(
        test_id=case["id"],
        area="entity",
        passed=passed,
        score=overall,
        details={
            "input": case["input"],
            "expected_action_count": len(expected_actions),
            "predicted_action_count": len(actions),
            "pipeline_f1": pipeline_score.f1,
            "field_match_rate": field_match_rate,
            "field_details": field_details,
            "predicted_types": [a["type"] for a in actions],
            "tags": case.get("tags", []),
        },
    ))

    assert passed, (
        f"Entity score {overall:.2f} < 0.5 — "
        f"pipeline F1={pipeline_score.f1:.2f}, field_match={field_match_rate:.2f}"
    )
