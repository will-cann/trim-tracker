"""Evaluation framework configuration."""

from __future__ import annotations

import os
from pathlib import Path

# Paths
EVAL_DIR = Path(__file__).parent
DATASETS_DIR = EVAL_DIR / "datasets"
FIXTURES_DIR = EVAL_DIR / "fixtures"
REPORTS_DIR = EVAL_DIR / "reports"

# API endpoint (override with --eval-endpoint or EVAL_ENDPOINT env var)
DEFAULT_ENDPOINT = "http://localhost:8888/.netlify/functions/ai-parse"
ENDPOINT = os.getenv("EVAL_ENDPOINT", DEFAULT_ENDPOINT)

# Auth token for live mode (Auth0 JWT)
AUTH_TOKEN = os.getenv("EVAL_AUTH_TOKEN", "")

# Scoring thresholds
FUZZY_MATCH_THRESHOLD = 85          # rapidfuzz ratio for string fields
NUMERIC_TOLERANCE_PCT = 2.0         # percentage tolerance for weight fields
NUMERIC_TOLERANCE_ABS = 1.0         # absolute tolerance in grams
TIME_TOLERANCE_MINUTES = 5          # minutes tolerance for time fields

# Silence chunking thresholds to test (ms)
SILENCE_THRESHOLDS = [500, 750, 1000, 1500, 2000]

# Current production values (from useDeepgram.ts + ChatPanel.tsx)
CURRENT_AMBIENT_FLUSH_MS = 4000     # SILENCE_FLUSH_MS in ChatPanel.tsx
CURRENT_ACTION_ENDPOINTING_MS = 300 # endpointing in useDeepgram.ts
CURRENT_UTTERANCE_END_MS = 1500     # utterance_end_ms in useDeepgram.ts
