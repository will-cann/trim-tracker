/**
 * apiService.aiParse — streaming consumer tests.
 *
 * Verifies the NDJSON stream parsing path:
 *  - text_delta events fire the onTextDelta callback in order
 *  - the final done event resolves the Promise with the expected payload
 *  - error events reject the Promise
 *  - non-streaming mode (no onTextDelta) still works via JSON body
 *  - partial lines across chunk boundaries are handled correctly
 *
 * Run with: npx vitest run src/services/__tests__/aiParseStreaming.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the auth module so fetchWithAuth doesn't try to pull a token
vi.mock('../../contexts/authContext', () => ({
    getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
}));

// Mock chatDb (imported transitively by apiService)
vi.mock('../chatDb', () => ({ chatDb: {} }));

import { aiParse } from '../apiService';

// Helper: build a ReadableStream that yields the provided chunks
// (each chunk is a string that gets encoded). Useful for testing
// buffer-split behavior.
function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        },
    });
}

// Helper: build a mock Response with the given body stream and headers
function mockStreamingResponse(chunks: string[]): Response {
    return {
        ok: true,
        status: 200,
        body: streamFromChunks(chunks),
        headers: new Headers({ 'content-type': 'application/x-ndjson' }),
        json: async () => ({}),
        text: async () => chunks.join(''),
    } as unknown as Response;
}

// Helper: build a mock JSON response
function mockJsonResponse(obj: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: async () => obj,
        text: async () => JSON.stringify(obj),
        headers: new Headers({ 'content-type': 'application/json' }),
    } as unknown as Response;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('aiParse streaming', () => {
    const baseContext = {
        hasActiveSession: false,
        trimmerProfiles: [],
        existingEntries: [],
        harvests: [],
        humanTasks: [],
        screenContext: 'Test',
    };

    it('fires onTextDelta for each text_delta event and resolves with the done payload', async () => {
        const lines = [
            JSON.stringify({ type: 'text_delta', text: 'Hello' }) + '\n',
            JSON.stringify({ type: 'text_delta', text: ', ' }) + '\n',
            JSON.stringify({ type: 'text_delta', text: 'world.' }) + '\n',
            JSON.stringify({
                type: 'done',
                actions: [{ type: 'create_session', data: { strain: 'Blue Dream' } }],
                toolResults: [],
                message: 'Hello, world.',
            }) + '\n',
        ];
        (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockStreamingResponse([lines.join('')])
        );

        const deltas: string[] = [];
        const result = await aiParse({
            message: 'test',
            context: baseContext,
            onTextDelta: (delta) => deltas.push(delta),
        });

        expect(deltas).toEqual(['Hello', ', ', 'world.']);
        expect(result.message).toBe('Hello, world.');
        expect(result.actions).toHaveLength(1);
        expect(result.actions[0].type).toBe('create_session');
    });

    it('handles partial lines split across chunk boundaries', async () => {
        const fullLine1 = JSON.stringify({ type: 'text_delta', text: 'Partial' }) + '\n';
        const fullLine2 = JSON.stringify({ type: 'text_delta', text: 'Chunks' }) + '\n';
        const doneLine = JSON.stringify({ type: 'done', actions: [], toolResults: [], message: 'PartialChunks' }) + '\n';

        // Split the NDJSON arbitrarily — a chunk ending mid-JSON, etc.
        const full = fullLine1 + fullLine2 + doneLine;
        const split1 = full.slice(0, 15);           // mid-first-line
        const split2 = full.slice(15, 50);          // rest of first + start of second
        const split3 = full.slice(50);              // rest + done

        (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockStreamingResponse([split1, split2, split3])
        );

        const deltas: string[] = [];
        const result = await aiParse({
            message: 'test',
            context: baseContext,
            onTextDelta: (delta) => deltas.push(delta),
        });

        expect(deltas).toEqual(['Partial', 'Chunks']);
        expect(result.message).toBe('PartialChunks');
    });

    it('skips malformed JSON lines gracefully', async () => {
        const lines = [
            JSON.stringify({ type: 'text_delta', text: 'Valid' }) + '\n',
            '{not valid json}\n',
            JSON.stringify({ type: 'text_delta', text: 'AlsoValid' }) + '\n',
            JSON.stringify({ type: 'done', actions: [], toolResults: [], message: 'ValidAlsoValid' }) + '\n',
        ];
        (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockStreamingResponse([lines.join('')])
        );

        const deltas: string[] = [];
        const result = await aiParse({
            message: 'test',
            context: baseContext,
            onTextDelta: (delta) => deltas.push(delta),
        });

        expect(deltas).toEqual(['Valid', 'AlsoValid']);
        expect(result.message).toBe('ValidAlsoValid');
    });

    it('rejects with the error when a stream error event arrives', async () => {
        const lines = [
            JSON.stringify({ type: 'text_delta', text: 'partial' }) + '\n',
            JSON.stringify({ type: 'error', error: 'Anthropic rate limit exceeded' }) + '\n',
        ];
        (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockStreamingResponse([lines.join('')])
        );

        await expect(
            aiParse({
                message: 'test',
                context: baseContext,
                onTextDelta: () => { /* noop */ },
            })
        ).rejects.toThrow('Anthropic rate limit exceeded');
    });

    it('rejects when the stream ends without a done event', async () => {
        const lines = [
            JSON.stringify({ type: 'text_delta', text: 'orphan' }) + '\n',
        ];
        (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockStreamingResponse([lines.join('')])
        );

        await expect(
            aiParse({
                message: 'test',
                context: baseContext,
                onTextDelta: () => { /* noop */ },
            })
        ).rejects.toThrow(/done event/);
    });

    it('sends streaming: true in the request body when onTextDelta is provided', async () => {
        const lines = [
            JSON.stringify({ type: 'done', actions: [], toolResults: [], message: 'ok' }) + '\n',
        ];
        const fetchMock = vi.fn().mockResolvedValue(mockStreamingResponse([lines.join('')]));
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        await aiParse({
            message: 'test',
            context: baseContext,
            onTextDelta: () => { /* noop */ },
        });

        const [, init] = fetchMock.mock.calls[0];
        const body = JSON.parse(init.body as string);
        expect(body.streaming).toBe(true);
    });

    it('does NOT set streaming: true when onTextDelta is omitted (backward compat)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockJsonResponse({ actions: [], toolResults: [], message: 'ok' })
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await aiParse({
            message: 'test',
            context: baseContext,
        });

        const [, init] = fetchMock.mock.calls[0];
        const body = JSON.parse(init.body as string);
        expect(body.streaming).toBe(false);
        expect(result.message).toBe('ok');
    });

    it('preserves newlines in streamed markdown content (regression for markdown tables)', async () => {
        // Simulate a streamed markdown table exactly the way Anthropic
        // would send it: text deltas containing newlines between table rows.
        // The real issue we saw in production was that tables weren't
        // rendering — all rows appeared on one line. This test locks in
        // that the pipeline preserves newlines across JSON round trips.
        const tableMarkdown = "I'll look up your trim inventory.\n\n| Strain | Package | Qty |\n|--------|---------|-----|\n| Sour Diesel | PKG-SD-T001 | 175.5 |\n| Blue Dream | PKG-BD-T001 | 120.3 |\n\nTotal: 295.8g.";

        // Break the markdown into 4 deltas that each contain newlines.
        const deltas = [
            "I'll look up your trim inventory.\n\n",
            "| Strain | Package | Qty |\n|--------|---------|-----|\n",
            "| Sour Diesel | PKG-SD-T001 | 175.5 |\n| Blue Dream | PKG-BD-T001 | 120.3 |\n",
            "\nTotal: 295.8g.",
        ];

        const lines = deltas.map(d => JSON.stringify({ type: 'text_delta', text: d }) + '\n');
        lines.push(JSON.stringify({ type: 'done', actions: [], toolResults: [], message: tableMarkdown }) + '\n');

        (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
            mockStreamingResponse([lines.join('')])
        );

        const received: string[] = [];
        const result = await aiParse({
            message: 'test',
            context: baseContext,
            onTextDelta: (delta) => received.push(delta),
        });

        // Each delta must be passed through with its newlines intact.
        expect(received).toEqual(deltas);

        // Concatenation must equal the full markdown table (newlines preserved).
        expect(received.join('')).toBe(tableMarkdown);

        // The done payload's message is the authoritative version — also
        // must have newlines so ReactMarkdown can recognize the table.
        expect(result.message).toBe(tableMarkdown);
        expect(result.message).toContain('\n|--------|');
        expect(result.message.split('\n').length).toBeGreaterThan(5);
    });

    it('passes abortSignal through to fetch', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            mockJsonResponse({ actions: [], toolResults: [], message: 'ok' })
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const controller = new AbortController();
        await aiParse({
            message: 'test',
            context: baseContext,
            abortSignal: controller.signal,
        });

        const [, init] = fetchMock.mock.calls[0];
        expect(init.signal).toBe(controller.signal);
    });
});
