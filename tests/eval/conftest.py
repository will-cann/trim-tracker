"""Shared pytest fixtures and configuration for the eval framework."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from .client import AiParseClient
from .config import DATASETS_DIR, DEFAULT_ENDPOINT
from .report import ReportCollector, generate_report


# --- CLI options ---

def pytest_addoption(parser):
    parser.addoption(
        "--eval-mode",
        default="mock",
        choices=["mock", "live", "record"],
        help="Evaluation mode: mock (fixtures), live (real API), record (capture fixtures)",
    )
    parser.addoption(
        "--eval-endpoint",
        default=DEFAULT_ENDPOINT,
        help="API endpoint URL for live/record mode",
    )


# --- Fixtures ---

@pytest.fixture(scope="session")
def eval_mode(request) -> str:
    return request.config.getoption("--eval-mode")


@pytest.fixture(scope="session")
def api_client(request, eval_mode) -> AiParseClient:
    endpoint = request.config.getoption("--eval-endpoint")
    client = AiParseClient(mode=eval_mode, endpoint=endpoint)
    yield client
    client.close()


@pytest.fixture(scope="session")
def report_collector() -> ReportCollector:
    return ReportCollector()


@pytest.fixture(scope="session")
def base_context() -> dict:
    """Default context loaded from datasets/contexts.json."""
    ctx_path = DATASETS_DIR / "contexts.json"
    if ctx_path.exists():
        data = json.loads(ctx_path.read_text())
        return data.get("default", _minimal_context())
    return _minimal_context()


def _minimal_context() -> dict:
    return {
        "hasActiveSession": False,
        "trimmerProfiles": [
            {"id": "tp-1", "name": "Maria Garcia"},
            {"id": "tp-2", "name": "Carlos Rodriguez"},
            {"id": "tp-3", "name": "Jenny Chen"},
        ],
        "existingEntries": [],
        "harvests": [
            {"id": "h-1", "batchId": "BATCH-GMO-001", "strain": "GMO", "status": "active"},
            {"id": "h-2", "batchId": "BATCH-WIFI-001", "strain": "Wi Fi OG", "status": "planning"},
        ],
        "humanTasks": [],
        "plantMapSummary": [
            {
                "roomName": "Veg Room 1",
                "roomId": "r-1",
                "strains": ["Ice Cream Cake", "GMO"],
                "plantIds": ["p-1", "p-2", "p-3"],
                "entityType": "plants",
                "plantHealth": 85,
                "contaminants": [],
            },
            {
                "roomName": "Flower Room 1",
                "roomId": "r-2",
                "strains": ["Wedding Cake", "Gelato"],
                "plantIds": ["p-4", "p-5", "p-6", "p-7"],
                "entityType": "plants",
                "plantHealth": 92,
                "contaminants": [],
            },
        ],
        "screenContext": "",
    }


# --- Markers ---

def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "live: requires live API endpoint")
    config.addinivalue_line("markers", "slow: long-running evaluation")


def pytest_collection_modifyitems(config, items):
    """Auto-skip live tests when not in live/record mode."""
    mode = config.getoption("--eval-mode", "mock")
    if mode == "mock":
        skip_live = pytest.mark.skip(reason="live tests require --eval-mode=live or record")
        for item in items:
            if "live" in item.keywords:
                item.add_marker(skip_live)


# --- Session-level report generation ---

def pytest_sessionfinish(session, exitstatus):
    """Generate report after all tests complete."""
    # Find the report_collector if it was used
    collector = getattr(session, "_eval_report_collector", None)
    if collector and collector.results:
        mode = session.config.getoption("--eval-mode", "mock")
        generate_report(collector, mode)


@pytest.fixture(autouse=True)
def _register_collector(request, report_collector):
    """Make the collector available at session level for report generation."""
    request.session._eval_report_collector = report_collector
