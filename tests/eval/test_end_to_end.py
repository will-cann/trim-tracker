"""Area 4: End-to-end pipeline validation.

Tests the full pipeline: transcript → parse → structured actions → schema validation.
Verifies required fields are present, types are correct, and enums are valid.
"""

from __future__ import annotations

import json

import pytest

from .config import DATASETS_DIR
from .report import EvalResult
from .schemas import validate_action
from .scoring import score_pipeline


def _load_cases() -> list[dict]:
    path = DATASETS_DIR / "end_to_end.json"
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
def test_end_to_end(case, api_client, report_collector):
    """Test full pipeline with schema validation."""
    context = _build_context(case)
    expected_actions = case["expected_actions"]

    response = api_client.parse(
        transcript_chunks=[case["input"]],
        context=context,
    )

    actions = response.get("actions", [])

    # 1. Schema validation on every returned action
    schema_errors: list[dict] = []
    for action in actions:
        errors = validate_action(action)
        if errors:
            schema_errors.append({
                "action_type": action.get("type"),
                "errors": errors,
            })

    schema_valid = len(schema_errors) == 0

    # 2. Pipeline scoring (action type match + field accuracy)
    predicted = [{"type": a["type"], "data": a.get("data", {})} for a in actions]
    pipeline_score = score_pipeline(predicted, expected_actions)

    # 3. Required field check from dataset
    missing_required: list[dict] = []
    for expected in expected_actions:
        required = expected.get("required_fields", [])
        if not required:
            continue
        # Find matching predicted action
        exp_type = expected["type"]
        matched = next(
            (a for a in actions if _type_match(a["type"], exp_type)),
            None,
        )
        if matched:
            data = matched.get("data", {})
            missing = [f for f in required if f not in data or data[f] is None]
            if missing:
                missing_required.append({
                    "action_type": exp_type,
                    "missing_fields": missing,
                })

    # 4. Fields that would require manual correction
    correction_fields: list[dict] = []
    for action_score in pipeline_score.per_action:
        for fs in action_score.field_scores:
            if not fs.match:
                correction_fields.append({
                    "field": fs.field_name,
                    "similarity": fs.similarity,
                    "detail": fs.detail,
                })

    # Overall score: weight schema validity, pipeline F1, and required fields
    required_score = 1.0 - (len(missing_required) / max(len(expected_actions), 1))
    overall = (
        (0.3 * (1.0 if schema_valid else 0.0))
        + (0.5 * pipeline_score.f1)
        + (0.2 * required_score)
    )
    passed = overall >= 0.5 and schema_valid

    report_collector.add(EvalResult(
        test_id=case["id"],
        area="e2e",
        passed=passed,
        score=overall,
        details={
            "input": case["input"],
            "expected_action_count": len(expected_actions),
            "predicted_action_count": len(actions),
            "schema_valid": schema_valid,
            "schema_errors": schema_errors,
            "pipeline_f1": pipeline_score.f1,
            "required_score": required_score,
            "missing_required": missing_required,
            "correction_fields": correction_fields,
            "predicted_types": [a["type"] for a in actions],
            "expected_types": [a["type"] for a in expected_actions],
            "tags": case.get("tags", []),
        },
    ))

    assert passed, (
        f"E2E score {overall:.2f} < 0.5 — "
        f"schema_valid={schema_valid}, F1={pipeline_score.f1:.2f}, "
        f"required={required_score:.2f}"
    )


def _type_match(a: str, b: str) -> bool:
    """Compare action types, normalizing plural/singular."""
    def _base(t: str) -> str:
        return t.rstrip("s") if t.endswith("s") and not t.endswith("ss") else t
    return _base(a) == _base(b)
