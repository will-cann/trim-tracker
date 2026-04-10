/**
 * Shared helpers for ambient transcript chunking.
 *
 * There are currently two ambient entry points — `AmbientContext` (AI home
 * surface) and `ChatPanel` (chat surface) — each with its own Deepgram
 * instance and buffer. They share these helpers to keep behavior consistent
 * until the implementations are consolidated.
 *
 * Design notes:
 * - The silence window needs to be generous enough for narrated room walks
 *   and multi-item dictation (e.g. listing 7 strains for a multi-input
 *   extraction run) where the user may pause mid-list.
 * - Tail overlap lets the next chunk start with the tail of the previous
 *   utterance, avoiding total context loss at flush boundaries. The system
 *   prompt has an explicit rule telling the AI to amend (not duplicate)
 *   actions that were already committed from the tail.
 */

/** How long the buffer waits without activity before flushing to the AI. */
export const SILENCE_FLUSH_MS = 10000;

/** How many characters of the flushed text to carry into the next chunk. */
export const TAIL_OVERLAP_CHARS = 150;

/**
 * Return the tail of `text` to preserve across a flush boundary. Snaps to
 * the LAST sentence boundary within the overlap window if possible (so the
 * retained tail is the most recent complete thought), otherwise to a word
 * boundary so we never split mid-word. Returns the input unchanged if it's
 * already shorter than the overlap window.
 */
export function retainTail(text: string): string {
    if (text.length <= TAIL_OVERLAP_CHARS) return text;
    const candidate = text.slice(-TAIL_OVERLAP_CHARS);
    // Find the LAST sentence boundary within the candidate. `.exec` in a
    // loop is the cleanest way to walk all matches and take the final one;
    // a greedy capture would grab the first boundary instead (the whole
    // point of this helper is to keep the MOST RECENT sentence).
    const sentenceRegex = /[.!?]\s+/g;
    let lastMatch: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = sentenceRegex.exec(candidate)) !== null) {
        lastMatch = m;
    }
    if (lastMatch) {
        const after = candidate.slice(lastMatch.index + lastMatch[0].length);
        if (after.trim()) return after;
    }
    // No sentence boundary — fall back to the first word boundary so we
    // skip any partial-word prefix and start the tail on a clean word.
    const wordBoundary = candidate.indexOf(' ');
    return wordBoundary === -1 ? candidate : candidate.slice(wordBoundary + 1);
}
