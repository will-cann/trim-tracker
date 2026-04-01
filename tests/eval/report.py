"""Report generation for evaluation runs."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .config import REPORTS_DIR


@dataclass
class EvalResult:
    test_id: str
    area: str  # intent, entity, edge, e2e, chunking
    passed: bool
    score: float
    details: dict = field(default_factory=dict)


@dataclass
class ReportCollector:
    """Accumulates test results during a pytest session."""
    results: list[EvalResult] = field(default_factory=list)

    def add(self, result: EvalResult):
        self.results.append(result)

    def summary(self) -> dict:
        total = len(self.results)
        passed = sum(1 for r in self.results if r.passed)

        by_area: dict[str, list[EvalResult]] = {}
        for r in self.results:
            by_area.setdefault(r.area, []).append(r)

        area_scores = {}
        for area, results in by_area.items():
            scores = [r.score for r in results]
            area_scores[area] = {
                "count": len(results),
                "passed": sum(1 for r in results if r.passed),
                "avg_score": sum(scores) / len(scores) if scores else 0.0,
            }

        return {
            "total_cases": total,
            "passed": passed,
            "failed": total - passed,
            "pass_rate": passed / total if total > 0 else 0.0,
            "areas": area_scores,
        }


def generate_report(collector: ReportCollector, mode: str) -> Path:
    """Generate JSON and text reports from collected results."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    summary = collector.summary()

    # --- JSON report ---
    report_data = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "summary": summary,
        "regression": _check_regression(summary),
        "details": [
            {
                "test_id": r.test_id,
                "area": r.area,
                "passed": r.passed,
                "score": r.score,
                "details": r.details,
            }
            for r in collector.results
        ],
    }

    json_path = REPORTS_DIR / f"eval_{timestamp}.json"
    json_path.write_text(json.dumps(report_data, indent=2, ensure_ascii=False))

    # --- Text summary ---
    lines = [
        f"NeuroCann Eval Report — {timestamp}",
        f"Mode: {mode}",
        f"Total: {summary['total_cases']}  Passed: {summary['passed']}  "
        f"Failed: {summary['failed']}  Rate: {summary['pass_rate']:.0%}",
        "",
    ]

    for area, stats in summary.get("areas", {}).items():
        lines.append(
            f"  {area:.<24} {stats['passed']}/{stats['count']} "
            f"(avg score: {stats['avg_score']:.2f})"
        )

    regression = report_data["regression"]
    if regression.get("regressions"):
        lines.append("")
        lines.append("REGRESSIONS:")
        for reg in regression["regressions"]:
            lines.append(f"  {reg}")

    lines.append("")
    txt_path = REPORTS_DIR / f"eval_{timestamp}.txt"
    txt_path.write_text("\n".join(lines))

    # Update baseline if this is the best run
    _update_baseline(summary)

    return json_path


def _check_regression(summary: dict) -> dict:
    """Compare against baseline if it exists."""
    baseline_path = REPORTS_DIR / "baseline.json"
    if not baseline_path.exists():
        return {"vs_baseline": "no baseline", "regressions": []}

    baseline = json.loads(baseline_path.read_text())
    regressions = []

    for area, stats in summary.get("areas", {}).items():
        baseline_area = baseline.get("areas", {}).get(area)
        if not baseline_area:
            continue
        diff = stats["avg_score"] - baseline_area["avg_score"]
        if diff < -0.05:  # 5% regression threshold
            regressions.append(
                f"{area}: {baseline_area['avg_score']:.2f} -> {stats['avg_score']:.2f} "
                f"({diff:+.2f})"
            )

    return {
        "vs_baseline": "ok" if not regressions else f"{len(regressions)} regressions",
        "regressions": regressions,
    }


def _update_baseline(summary: dict) -> None:
    """Update baseline.json if current run has higher overall pass rate."""
    baseline_path = REPORTS_DIR / "baseline.json"

    if baseline_path.exists():
        baseline = json.loads(baseline_path.read_text())
        if summary["pass_rate"] <= baseline.get("pass_rate", 0):
            return  # current run is not better

    baseline_path.write_text(json.dumps(summary, indent=2))
