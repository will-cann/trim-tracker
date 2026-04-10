/**
 * Ambient chunker helpers — tail overlap behavior.
 *
 * Exercises retainTail() because it's the correctness-critical piece of the
 * chunking refactor: it preserves context across flush boundaries so the AI
 * doesn't lose mid-utterance state when the silence timer fires during a
 * multi-item narration (e.g. listing 7 strains for one extraction run).
 *
 * Run with: npx vitest run src/lib/__tests__/ambientChunker.test.ts
 */
import { describe, it, expect } from 'vitest';
import { retainTail, TAIL_OVERLAP_CHARS, SILENCE_FLUSH_MS } from '../ambientChunker';

describe('retainTail', () => {
    it('returns the input unchanged when shorter than the overlap window', () => {
        const short = 'start a wash for Toadstool OG';
        expect(retainTail(short)).toBe(short);
    });

    it('returns the exact input when length equals the overlap window', () => {
        const exact = 'x'.repeat(TAIL_OVERLAP_CHARS);
        expect(retainTail(exact)).toBe(exact);
    });

    it('snaps to the last sentence boundary within the overlap window', () => {
        const longText =
            'ten plants in flower two are showing powdery mildew on the lower fan leaves. ' +
            'We need to pull them first thing tomorrow. Also the Gelato batch in flower three is ready to flip.';
        const tail = retainTail(longText);
        // The tail should start mid-text at a sentence boundary, not mid-word.
        expect(tail.startsWith('Also the Gelato')).toBe(true);
        expect(tail.length).toBeLessThanOrEqual(TAIL_OVERLAP_CHARS);
    });

    it('falls back to a word boundary when no sentence boundary is in the window', () => {
        // A long unpunctuated list — the user is rattling off strains.
        const strainList = Array.from({ length: 20 }, (_, i) => `Strain${i + 1}`).join(' ');
        const tail = retainTail(strainList);
        expect(tail.length).toBeLessThanOrEqual(TAIL_OVERLAP_CHARS);
        // Must not start mid-word: every word in the tail should still be a
        // complete strain name.
        for (const word of tail.split(' ')) {
            expect(word).toMatch(/^Strain\d+$/);
        }
    });

    it('preserves the tail end (most recent content)', () => {
        const longText = 'filler '.repeat(50) + 'the Blackberry wash yielded 800 grams of hash';
        const tail = retainTail(longText);
        expect(tail.endsWith('the Blackberry wash yielded 800 grams of hash')).toBe(true);
    });

    it('handles exactly one long word gracefully (no sentence, no space)', () => {
        // No sentence punctuation, no spaces — the fallback is to take the
        // raw candidate slice.
        const noBoundaries = 'a'.repeat(TAIL_OVERLAP_CHARS * 2);
        const tail = retainTail(noBoundaries);
        expect(tail).toBe('a'.repeat(TAIL_OVERLAP_CHARS));
    });
});

describe('SILENCE_FLUSH_MS', () => {
    it('is generous enough for narrated room walks with thinking pauses', () => {
        // Regression guard: if this drops below 8s it probably means someone
        // tweaked it without thinking through the narration use case. 8-12s
        // is the sweet spot; lower values cause mid-utterance flushes during
        // natural cultivation narration ("plant one... two... three...").
        expect(SILENCE_FLUSH_MS).toBeGreaterThanOrEqual(8000);
        expect(SILENCE_FLUSH_MS).toBeLessThanOrEqual(15000);
    });
});
