import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { config } from './config';
import { getPool, withTransaction } from './db';
import { validateDemoRequest } from './demoRequest';
import { countRecentDemoRequests, createDemoRequest, DEMO_REQUESTS_PER_HOUR, prefilledSchedulingUrl } from './prospects';
import { handleMcpRequest } from './mcp/server';

function clientIp(headers: Headers): string | null {
    // Netlify's proxy (/api/growth/*) and Railway's edge both set X-Forwarded-For;
    // the first hop is the visitor. Spoofable, so it only feeds best-effort rate limiting.
    const xff = headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim() || null;
    return headers.get('x-real-ip');
}

function hashIp(ip: string | null): string | null {
    if (!ip) return null;
    return createHash('sha256').update(`${config.ipHashSalt}:${ip}`).digest('hex');
}

export function createApp() {
    const app = new Hono();

    app.get('/healthz', async c => {
        try {
            await getPool().query('SELECT 1');
            return c.json({ ok: true });
        } catch {
            return c.json({ ok: false, error: 'database unreachable' }, 503);
        }
    });

    /** Public: the website's "Book a Demo" form. */
    app.post('/v1/demo-requests', async c => {
        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            return c.json({ error: 'Invalid JSON' }, 400);
        }

        const result = validateDemoRequest(body);
        if (!result.ok) {
            // Honeypot hits look like success so bots don't learn to adapt.
            if (result.spam) return c.json({ ok: true, schedulingUrl: null });
            return c.json({ error: result.error }, 400);
        }
        const input = result.value;
        const ipHash = hashIp(clientIp(c.req.raw.headers));

        try {
            if (ipHash && (await countRecentDemoRequests(getPool(), ipHash)) >= DEMO_REQUESTS_PER_HOUR) {
                return c.json({ error: 'Too many requests. Please email us instead.' }, 429);
            }
            const created = await withTransaction(client =>
                createDemoRequest(client, input, { ipHash, userAgent: c.req.header('user-agent')?.slice(0, 300) ?? null }),
            );
            console.log('[demo] request recorded', created);
            return c.json({
                ok: true,
                schedulingUrl: prefilledSchedulingUrl(config.demoSchedulingUrl, input.name, input.email),
            });
        } catch (err) {
            console.error('[demo] failed to record request:', (err as Error).message);
            return c.json({ error: 'Could not save your request. Please email us instead.' }, 500);
        }
    });

    /** Private: MCP endpoint for Claude Code / claude.ai and the CLI. */
    app.post('/mcp', async c => {
        const res = await handleMcpRequest(c.req.header('authorization'), await c.req.text());
        return new Response(res.body, { status: res.status, headers: res.headers });
    });
    app.get('/mcp', c => c.json({ error: 'Use POST (stateless Streamable HTTP; no SSE stream)' }, 405));

    return app;
}
