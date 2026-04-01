"""Scoring functions for evaluating AI pipeline outputs."""

from __future__ import annotations

from dataclasses import dataclass, field
from rapidfuzz import fuzz

from .config import (
    FUZZY_MATCH_THRESHOLD,
    NUMERIC_TOLERANCE_ABS,
    NUMERIC_TOLERANCE_PCT,
    TIME_TOLERANCE_MINUTES,
)


# --- Data classes for score results ---

@dataclass
class FieldScore:
    field_name: str
    match: bool
    similarity: float  # 0.0 - 1.0
    detail: str = ""


@dataclass
class ActionScore:
    type_match: bool
    field_scores: list[FieldScore] = field(default_factory=list)
    overall: float = 0.0

    def __post_init__(self):
        if self.type_match and self.field_scores:
            self.overall = sum(f.similarity for f in self.field_scores) / len(self.field_scores)
        elif self.type_match:
            self.overall = 1.0


@dataclass
class PipelineScore:
    precision: float
    recall: float
    f1: float
    per_action: list[ActionScore] = field(default_factory=list)


@dataclass
class ChunkBoundaryScore:
    expected_chunks: int
    predicted_chunks: int
    correct_boundaries: int
    split_errors: int  # action incorrectly split across chunks
    merge_errors: int  # multiple actions merged into one chunk
    f1: float = 0.0


# --- Field-level scoring ---

def score_string_field(predicted: str, expected: str) -> FieldScore:
    """Score a string field using fuzzy matching."""
    if not predicted and not expected:
        return FieldScore("", True, 1.0, "both empty")

    ratio = fuzz.ratio(str(predicted).lower().strip(), str(expected).lower().strip())
    match = ratio >= FUZZY_MATCH_THRESHOLD
    return FieldScore("", match, ratio / 100.0, f"fuzzy={ratio:.0f}")


def score_number_field(predicted: float | int | None, expected: float | int | None,
                       tolerance_pct: float | None = None,
                       tolerance_abs: float | None = None) -> FieldScore:
    """Score a numeric field with configurable tolerances."""
    if predicted is None and expected is None:
        return FieldScore("", True, 1.0, "both None")
    if predicted is None or expected is None:
        return FieldScore("", False, 0.0, f"predicted={predicted}, expected={expected}")

    pred = float(predicted)
    exp = float(expected)

    tol_pct = tolerance_pct if tolerance_pct is not None else NUMERIC_TOLERANCE_PCT
    tol_abs = tolerance_abs if tolerance_abs is not None else NUMERIC_TOLERANCE_ABS

    if exp == 0:
        match = abs(pred) <= tol_abs
    else:
        pct_diff = abs(pred - exp) / abs(exp) * 100
        abs_diff = abs(pred - exp)
        match = pct_diff <= tol_pct or abs_diff <= tol_abs

    if match:
        similarity = 1.0
    elif exp != 0:
        similarity = max(0.0, 1.0 - abs(pred - exp) / abs(exp))
    else:
        similarity = 0.0

    return FieldScore("", match, similarity, f"pred={pred}, exp={exp}")


def score_enum_field(predicted: str, expected: str) -> FieldScore:
    """Score an enum field (exact match)."""
    match = str(predicted).lower().strip() == str(expected).lower().strip()
    return FieldScore("", match, 1.0 if match else 0.0, f"pred={predicted}, exp={expected}")


def _parse_time_minutes(t: str) -> int | None:
    """Parse HH:mm or common variants to minutes since midnight."""
    t = t.strip().lower()
    try:
        if ":" in t:
            parts = t.replace("am", "").replace("pm", "").strip().split(":")
            h, m = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
            if "pm" in t.lower() and h < 12:
                h += 12
            if "am" in t.lower() and h == 12:
                h = 0
            return h * 60 + m
        if t.endswith("am") or t.endswith("pm"):
            h = int(t[:-2].strip())
            if t.endswith("pm") and h < 12:
                h += 12
            if t.endswith("am") and h == 12:
                h = 0
            return h * 60
    except (ValueError, IndexError):
        pass
    return None


def score_time_field(predicted: str, expected: str) -> FieldScore:
    """Score a time field with tolerance window."""
    pred_mins = _parse_time_minutes(predicted)
    exp_mins = _parse_time_minutes(expected)

    if pred_mins is None or exp_mins is None:
        str_match = str(predicted).strip() == str(expected).strip()
        return FieldScore("", str_match, 1.0 if str_match else 0.0, "unparseable time")

    diff = abs(pred_mins - exp_mins)
    match = diff <= TIME_TOLERANCE_MINUTES
    similarity = max(0.0, 1.0 - diff / 60.0)  # linear decay over 1 hour
    return FieldScore("", match, similarity, f"diff={diff}min")


def score_array_field(predicted: list, expected: list) -> FieldScore:
    """Score an array field using set comparison (order-independent)."""
    if not predicted and not expected:
        return FieldScore("", True, 1.0, "both empty")

    pred_set = set(str(x).lower().strip() for x in predicted)
    exp_set = set(str(x).lower().strip() for x in expected)

    if not pred_set and not exp_set:
        return FieldScore("", True, 1.0, "both empty")

    intersection = pred_set & exp_set
    union = pred_set | exp_set
    jaccard = len(intersection) / len(union) if union else 0.0
    match = pred_set == exp_set

    return FieldScore("", match, jaccard, f"jaccard={jaccard:.2f}")


# --- Entity field scoring dispatcher ---

def score_entity_field(predicted, expected, field_spec: dict) -> FieldScore:
    """Score a field using the appropriate comparison based on field spec."""
    match_type = field_spec.get("match", "exact")
    field_type = field_spec.get("type", "string")

    # Use match hint from dataset if provided
    if match_type == "fuzzy":
        return score_string_field(str(predicted), str(expected))

    if field_type in ("number", "float", "int"):
        return score_number_field(
            predicted, expected,
            tolerance_pct=field_spec.get("tolerance_pct"),
            tolerance_abs=field_spec.get("tolerance_abs"),
        )

    if field_type == "enum":
        return score_enum_field(str(predicted), str(expected))

    if field_type == "time":
        return score_time_field(str(predicted), str(expected))

    if field_type in ("array", "list"):
        return score_array_field(
            predicted if isinstance(predicted, list) else [],
            expected if isinstance(expected, list) else [],
        )

    # Default: exact string match for known values, fuzzy for identifiers
    if match_type == "exact":
        return score_enum_field(str(predicted), str(expected))

    return score_string_field(str(predicted), str(expected))


# --- Intent scoring ---

def score_intent(predicted_types: list[str], expected_types: list[str]) -> float:
    """Jaccard similarity of action type sets."""
    pred = set(predicted_types)
    exp = set(expected_types)

    if not pred and not exp:
        return 1.0
    if not pred or not exp:
        return 0.0

    # Normalize plural/singular aliases
    def _normalize(s: set[str]) -> set[str]:
        normalized = set()
        for t in s:
            # Strip trailing 's' for comparison (add_batches -> add_batch)
            base = t.rstrip("s") if t.endswith("s") and not t.endswith("ss") else t
            normalized.add(base)
        return normalized

    pred_norm = _normalize(pred)
    exp_norm = _normalize(exp)

    intersection = pred_norm & exp_norm
    union = pred_norm | exp_norm
    return len(intersection) / len(union) if union else 0.0


# --- Action-level scoring ---

def score_action(predicted: dict, expected: dict) -> ActionScore:
    """Score a single predicted action against expected."""
    pred_type = predicted.get("type", "")
    exp_type = expected.get("type", "")

    # Normalize type comparison
    def _base(t: str) -> str:
        return t.rstrip("s") if t.endswith("s") and not t.endswith("ss") else t

    type_match = _base(pred_type) == _base(exp_type)

    if not type_match:
        return ActionScore(type_match=False, overall=0.0)

    pred_data = predicted.get("data", {})
    exp_fields = expected.get("fields", {})

    field_scores = []
    for field_name, spec in exp_fields.items():
        expected_value = spec.get("value") if isinstance(spec, dict) else spec
        predicted_value = pred_data.get(field_name)

        if isinstance(spec, dict):
            fs = score_entity_field(predicted_value, expected_value, spec)
        else:
            fs = score_entity_field(predicted_value, expected_value, {"match": "exact"})

        fs.field_name = field_name
        field_scores.append(fs)

    return ActionScore(type_match=True, field_scores=field_scores)


# --- Pipeline scoring ---

def _align_actions(predicted: list[dict], expected: list[dict]) -> list[tuple[dict | None, dict | None]]:
    """Greedy alignment of predicted to expected actions by type match."""
    used_pred = set()
    pairs: list[tuple[dict | None, dict | None]] = []

    def _base(t: str) -> str:
        return t.rstrip("s") if t.endswith("s") and not t.endswith("ss") else t

    for exp in expected:
        best_idx = None
        best_score = -1.0
        for i, pred in enumerate(predicted):
            if i in used_pred:
                continue
            if _base(pred.get("type", "")) == _base(exp.get("type", "")):
                score = score_action(pred, exp).overall
                if score > best_score:
                    best_score = score
                    best_idx = i
        if best_idx is not None:
            pairs.append((predicted[best_idx], exp))
            used_pred.add(best_idx)
        else:
            pairs.append((None, exp))  # missed expected action

    for i, pred in enumerate(predicted):
        if i not in used_pred:
            pairs.append((pred, None))  # spurious prediction

    return pairs


def score_pipeline(predicted_actions: list[dict], expected_actions: list[dict]) -> PipelineScore:
    """Score a full pipeline output against expected actions."""
    if not predicted_actions and not expected_actions:
        return PipelineScore(precision=1.0, recall=1.0, f1=1.0)

    pairs = _align_actions(predicted_actions, expected_actions)

    per_action = []
    true_positives = 0

    for pred, exp in pairs:
        if pred is not None and exp is not None:
            action_score = score_action(pred, exp)
            per_action.append(action_score)
            if action_score.type_match:
                true_positives += 1
        elif pred is not None:
            per_action.append(ActionScore(type_match=False, overall=0.0))
        else:
            per_action.append(ActionScore(type_match=False, overall=0.0))

    n_predicted = len(predicted_actions)
    n_expected = len(expected_actions)

    precision = true_positives / n_predicted if n_predicted > 0 else 0.0
    recall = true_positives / n_expected if n_expected > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    return PipelineScore(precision=precision, recall=recall, f1=f1, per_action=per_action)


# --- Chunk boundary scoring ---

def score_chunk_boundaries(
    predicted_boundaries_ms: list[int],
    expected_boundaries_ms: list[int],
    tolerance_ms: int = 500,
) -> ChunkBoundaryScore:
    """Score chunk boundary placement."""
    pred_chunks = len(predicted_boundaries_ms) + 1
    exp_chunks = len(expected_boundaries_ms) + 1

    matched = 0
    used = set()
    for exp_b in expected_boundaries_ms:
        for i, pred_b in enumerate(predicted_boundaries_ms):
            if i in used:
                continue
            if abs(pred_b - exp_b) <= tolerance_ms:
                matched += 1
                used.add(i)
                break

    split_errors = max(0, pred_chunks - exp_chunks)
    merge_errors = max(0, exp_chunks - pred_chunks)

    if not expected_boundaries_ms and not predicted_boundaries_ms:
        f1 = 1.0
    else:
        p = matched / len(predicted_boundaries_ms) if predicted_boundaries_ms else 0.0
        r = matched / len(expected_boundaries_ms) if expected_boundaries_ms else 0.0
        f1 = 2 * p * r / (p + r) if (p + r) > 0 else 0.0

    return ChunkBoundaryScore(
        expected_chunks=exp_chunks,
        predicted_chunks=pred_chunks,
        correct_boundaries=matched,
        split_errors=split_errors,
        merge_errors=merge_errors,
        f1=f1,
    )
