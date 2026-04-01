"""Silence threshold chunking simulator.

Simulates how different silence thresholds would split a transcript,
without requiring actual audio data. Test cases provide annotated
transcripts with pause durations between segments.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class TranscriptSegment:
    """A segment of speech followed by a pause."""
    text: str
    pause_after_ms: int


@dataclass
class ChunkResult:
    """Result of simulated chunking."""
    chunks: list[str]
    boundary_positions_ms: list[int]  # cumulative ms where splits occurred


def simulate_chunking(
    segments: list[TranscriptSegment],
    threshold_ms: int,
) -> ChunkResult:
    """Simulate silence-based chunking at a given threshold.

    Segments represent sequential speech fragments with annotated pauses.
    When a pause >= threshold_ms is encountered, a chunk boundary is placed.

    Args:
        segments: List of TranscriptSegment with text and pause_after_ms.
        threshold_ms: Silence duration (ms) that triggers a chunk split.

    Returns:
        ChunkResult with the resulting chunks and boundary positions.
    """
    if not segments:
        return ChunkResult(chunks=[], boundary_positions_ms=[])

    chunks: list[str] = []
    boundaries: list[int] = []
    current_chunk_parts: list[str] = []
    cumulative_ms = 0

    for segment in segments:
        current_chunk_parts.append(segment.text)
        cumulative_ms += segment.pause_after_ms

        if segment.pause_after_ms >= threshold_ms:
            # Split here
            chunks.append(" ".join(current_chunk_parts).strip())
            boundaries.append(cumulative_ms)
            current_chunk_parts = []

    # Flush remaining text
    if current_chunk_parts:
        chunks.append(" ".join(current_chunk_parts).strip())

    # Remove the last boundary (it's the end of the transcript, not a split)
    # Actually, boundaries represent where splits happen, the last chunk
    # doesn't have a boundary after it.

    return ChunkResult(chunks=chunks, boundary_positions_ms=boundaries)


def segments_from_dataset(raw: list[dict]) -> list[TranscriptSegment]:
    """Convert raw dataset entries to TranscriptSegment objects."""
    return [
        TranscriptSegment(
            text=entry["text"],
            pause_after_ms=entry.get("pause_after_ms", 0),
        )
        for entry in raw
    ]
