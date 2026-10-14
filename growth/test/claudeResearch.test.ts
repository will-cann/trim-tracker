import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { researchCompany, type Research } from '../src/enrich/claudeResearch';

const parsed: Research = {
    summary: 'Indoor grower.', operation_types: ['cultivation'], states: ['CO'], estimated_canopy: null,
    license_numbers: [], fit_score: 140, fit_reasons: ['Licensed cultivator'], sources: ['https://acme.com'],
};

function fakeClient(opts: { refuse?: boolean } = {}) {
    const usage = { input_tokens: 100, output_tokens: 10 };
    const create = vi.fn()
        .mockResolvedValueOnce({ stop_reason: 'pause_turn', usage, content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: {} }] })
        .mockResolvedValueOnce({
            stop_reason: opts.refuse ? 'refusal' : 'end_turn', usage,
            content: [
                { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://acme.com', title: 'Acme' }] },
                { type: 'text', text: 'Acme Farms is an indoor grower in Denver.' },
            ],
        });
    const parse = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', usage, parsed_output: { ...parsed } });
    return { client: { beta: { messages: { create, parse } } } as unknown as Anthropic, create, parse };
}

describe('researchCompany', () => {
    it('returns null without a client', async () => {
        expect(await researchCompany({ company: 'Acme', domain: null }, null)).toBeNull();
    });

    it('researches with web search, resumes pause_turn, then extracts structured fields', async () => {
        const { client, create, parse } = fakeClient();
        const result = await researchCompany({ company: 'Acme Farms', domain: 'acmefarms.com', statedState: 'CO' }, client);

        expect(create).toHaveBeenCalledTimes(2);
        const first = create.mock.calls[0][0];
        expect(first.model).toBe('claude-opus-5-5');
        expect(first.tools).toEqual([{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }]);
        expect(first.fallbacks).toBe('default');
        expect(first.messages[0].content).toContain('Website domain: acmefarms.com');
        // The resume request re-sends the paused assistant turn.
        expect(create.mock.calls[1][0].messages[1].role).toBe('assistant');

        const extract = parse.mock.calls[0][0];
        expect(extract.tools).toBeUndefined();
        expect(extract.messages[0].content).toContain('Acme Farms is an indoor grower in Denver.');
        expect(extract.messages[0].content).toContain('https://acme.com');

        expect(result?.output.fit_score).toBe(100); // clamped
        expect(result).toMatchObject({ inputTokens: 300, outputTokens: 30 });
    });

    it('throws on refusal', async () => {
        const { client } = fakeClient({ refuse: true });
        await expect(researchCompany({ company: 'Acme', domain: null }, client)).rejects.toThrow(/refused/);
    });
});
