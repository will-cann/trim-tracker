/**
 * Shared plumbing for "read this document with Claude and get JSON back":
 * the invoice reader and the pick-list reader both take a PDF / image / text
 * from the picker and need the same request shape, limits and JSON unwrapping.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
export const DEFAULT_DOC_MODEL = 'claude-sonnet-4-20250514';
/** ~3.75 MB binary; Netlify caps bodies at 6 MB. */
export const MAX_BASE64_CHARS = 5 * 1024 * 1024;
export const MAX_TEXT_CHARS = 200_000;
export const MEDIA_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface DocumentBody {
    fileName?: string;
    mediaType?: string;
    /** base64 file bytes for PDF/image */
    data?: string;
    /** raw text for CSV/TXT exports */
    text?: string;
}

export type DocumentContent = { ok: true; content: unknown[] } | { ok: false; error: string };

/** Turns the request body into Claude message content, enforcing size and type limits. */
export function documentContent(body: DocumentBody, kind: string, instruction: string): DocumentContent {
    if (body.text) {
        if (body.text.length > MAX_TEXT_CHARS) return { ok: false, error: `${kind} text is too large.` };
        return { ok: true, content: [{ type: 'text', text: `${kind} export${body.fileName ? ` (${body.fileName})` : ''}:\n\n${body.text}` }] };
    }
    if (body.data) {
        const mediaType = body.mediaType ?? '';
        if (!MEDIA_TYPES.has(mediaType)) return { ok: false, error: `Unsupported file type: ${mediaType || 'unknown'}. Use PDF, JPG, PNG, or CSV.` };
        if (body.data.length > MAX_BASE64_CHARS) return { ok: false, error: 'File is too large. Keep it under ~3.5 MB (a phone photo usually needs downsizing).' };
        return {
            ok: true,
            content: [
                { type: mediaType === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: mediaType, data: body.data } },
                { type: 'text', text: instruction },
            ],
        };
    }
    return { ok: false, error: `Attach a ${kind.toLowerCase()} file (PDF, photo, or CSV).` };
}

export function extractJson(text: string): unknown {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object in model response');
    return JSON.parse(candidate.slice(start, end + 1));
}

export type ClaudeDocResult = { ok: true; text: string } | { ok: false; status: number; detail: string };

export async function askClaudeAboutDocument(opts: { apiKey: string; model: string; system: string; content: unknown[]; maxTokens?: number }): Promise<ClaudeDocResult> {
    const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': opts.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: opts.model, max_tokens: opts.maxTokens ?? 4096, system: opts.system, messages: [{ role: 'user', content: opts.content }] }),
    });
    if (!res.ok) return { ok: false, status: res.status, detail: (await res.text()).slice(0, 500) };
    const payload = (await res.json()) as { content?: { type: string; text?: string }[] };
    return { ok: true, text: (payload.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('\n') };
}

export function num(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

export function str(v: unknown): string | null {
    return typeof v === 'string' && v.trim() ? v.trim() : null;
}
