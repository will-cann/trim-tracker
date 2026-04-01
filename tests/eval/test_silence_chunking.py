"""Area 1: Silence threshold optimization.

Tests chunking at multiple silence thresholds and evaluates whether
the resulting chunks produce the correct actions when parsed.
"""

from __future__ import annotations

import json

import pytest

from .chunker import ChunkResult, segments_from_dataset, simulate_chunking
from .config import DATASETS_DIR, SILENCE_THRESHOLDS
from .report import EvalResult
from .scoring import score_chunk_boundaries


def _load_cases() -> list[dict]:
    path = DATASETS_DIR / "silence_chunking.json"
    data = json.loads(path.read_text())
    return data["cases"]


CASES = _load_cases()


def _case_threshold_ids():
    """Generate test IDs for parametrize."""
    ids = []
    for case in CASES:
        for threshold in SILENCE_THRESHOLDS:
            ids.append(f"{case['id']}_@{threshold}ms")
    return ids


def _case_threshold_params():
    """Generate (case, threshold) pairs."""
    params = []
    for case in CASES:
        for threshold in SILENCE_THRESHOLDS:
            params.append((case, threshold))
    return params


@pytest.mark.parametrize(
    "case,threshold_ms",
    _case_threshold_params(),
    ids=_case_threshold_ids(),
)
def test_silence_chunking(case, threshold_ms, report_collector):
    """Test chunk boundary accuracy at a given silence threshold.

    This test only validates chunking logic (no API calls).
    It checks whether the simulated chunks match expected boundaries.
    """
    segments = segments_from_dataset(case["segments"])
    result: ChunkResult = simulate_chunking(segments, threshold_ms)

    expected_boundaries = case.get("expected_boundaries_ms", [])
    expected_chunk_count = case.get("expected_chunk_count", len(expected_boundaries) + 1)

    boundary_score = score_chunk_boundaries(
        result.boundary_positions_ms,
        expected_boundaries,
        tolerance_ms=threshold_ms // 2,  # tolerance scales with threshold
    )

    # Check chunk count
    count_match = result.chunks == [] or len(result.chunks) == expected_chunk_count

    # Score: boundary F1 weighted with count accuracy
    count_score = 1.0 if count_match else max(
        0.0,
        1.0 - abs(len(result.chunks) - expected_chunk_count) / max(expected_chunk_count, 1),
    )
    overall = 0.6 * boundary_score.f1 + 0.4 * count_score
    passed = overall >= 0.5

    report_collector.add(EvalResult(
        test_id=f"{case['id']}@{threshold_ms}ms",
        area="chunking",
        passed=passed,
        score=overall,
        details={
            "threshold_ms": threshold_ms,
            "expected_chunks": expected_chunk_count,
            "predicted_chunks": len(result.chunks),
            "chunks": result.chunks,
            "expected_boundaries": expected_boundaries,
            "predicted_boundaries": result.boundary_positions_ms,
            "boundary_f1": boundary_score.f1,
            "split_errors": boundary_score.split_errors,
            "merge_errors": boundary_score.merge_errors,
            "count_match": count_match,
        },
    ))

    # Don't hard-fail — chunking tests are exploratory.
    # The report tracks scores for threshold comparison.


@pytest.fixture(scope="module")
def threshold_summary(report_collector):
    """After all chunking tests, compute per-threshold summary."""
    yield  # tests run here

    by_threshold: dict[int, list[float]] = {}
    for r in report_collector.results:
        if r.area != "chunking":
            continue
        t = r.details.get("threshold_ms")
        if t is not None:
            by_threshold.setdefault(t, []).append(r.score)

    if by_threshold:
        report_collector.add(EvalResult(
            test_id="chunking_summary",
            area="chunking",
            passed=True,
            score=0.0,
            details={
                "threshold_averages": {
                    str(t): sum(scores) / len(scores)
                    for t, scores in sorted(by_threshold.items())
                },
            },
        ))
