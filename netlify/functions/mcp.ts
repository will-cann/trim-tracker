import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { resolvePluginContext, type PluginContext } from './utils/apiKeys';
import { findTool, listTools, ToolInputError } from './utils/mcpTools';
import { checkRateLimit } from './utils/rateLimit';
import { captureError } from './utils/sentry';

/**
 * NeuroCann LLM plugin — a Model Context Protocol (MCP) server.
 *
 * Implements the stateless "Streamable HTTP" transport: every JSON-RPC request
 * arrives as a POST and is answered with a single JSON response. No sessions,
 * no server-initiated SSE streams, so it fits a serverless function.
 *
 * Connect from Claude Desktop / Claude Code / Cursor (or any MCP client) with the URL
 * `https://<host>/mcp` and an `Authorization: Bearer nck_...` header (keys are
 * created under Settings → LLM Plugin). See docs/llm-plugin.md.
 */

const SERVER_INFO = { name: 'neurocann', title: 'NeuroCann', version: '1.0.0' };
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

const SERVER_INSTRUCTIONS = `NeuroCann is a cannabis cultivation and operations platform. This server exposes one facility (the one the API key belongs to).

Start with get_facility_overview to see what the facility has, then use the list_* tools for detail. Weights are grams unless a unit is given. Harvests move planning → active → submitted → drying → ready → completed; plants move nursery → vegetative → flowering → harvested. For analytics (yields, totals, trends) call get_report_schema and then run_report. Write tools (create_task, update_task_status) only appear when the key has write scope; confirm with the user before creating or completing tasks.`;

// JSON-RPC 2.0 error codes
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: string | number | null;
    method: string;
    params?: any;
}

type JsonRpcId = string | number | null;

function rpcResult(id: JsonRpcId, result: unknown) {
    return { jsonrpc: '2.0' as const, id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown) {
    return { jsonrpc: '2.0' as const, id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version',
};

function respond(statusCode: number, body?: unknown, extraHeaders: Record<string, string> = {}): HandlerResponse {
    const headers: Record<string, string> = { ...CORS_HEADERS, ...extraHeaders };
    if (body === undefined) return { statusCode, headers };
    headers['Content-Type'] = 'application/json';
    return { statusCode, headers, body: JSON.stringify(body) };
}

function negotiateProtocolVersion(requested: unknown): string {
    return typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : LATEST_PROTOCOL_VERSION;
}

function isRequest(msg: unknown): msg is JsonRpcRequest {
    return !!msg && typeof msg === 'object' && (msg as any).jsonrpc === '2.0' && typeof (msg as any).method === 'string';
}

function textContent(payload: unknown) {
    return [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }];
}

async function callTool(ctx: PluginContext, params: any) {
    const name = params?.name;
    if (typeof name !== 'string') throw new ToolInputError('tools/call requires a tool "name"');

    const tool = findTool(name);
    if (!tool) {
        return { content: textContent(`Unknown tool: ${name}`), isError: true };
    }
    if (!ctx.scopes.includes(tool.definition.scope)) {
        return {
            content: textContent(`This API key does not have "${tool.definition.scope}" scope, which "${name}" requires. Create a key with write access under Settings → LLM Plugin.`),
            isError: true,
        };
    }

    const args = params?.arguments && typeof params.arguments === 'object' ? params.arguments : {};
    try {
        const result = await tool.handler(ctx, args);
        const structured = result !== null && typeof result === 'object' && !Array.isArray(result)
            ? result as Record<string, unknown>
            : { result };
        return { content: textContent(result), structuredContent: structured };
    } catch (err: any) {
        if (err instanceof ToolInputError) {
            return { content: textContent(err.message), isError: true };
        }
        captureError(err, { tool: name });
        console.error(`mcp tool "${name}" failed:`, err);
        return { content: textContent(`Tool "${name}" failed: ${err?.message ?? 'unknown error'}`), isError: true };
    }
}

async function dispatch(ctx: PluginContext, msg: JsonRpcRequest): Promise<Record<string, unknown> | null> {
    const id = msg.id ?? null;
    const isNotification = msg.id === undefined;

    switch (msg.method) {
        case 'initialize':
            return rpcResult(id, {
                protocolVersion: negotiateProtocolVersion(msg.params?.protocolVersion),
                capabilities: { tools: { listChanged: false } },
                serverInfo: SERVER_INFO,
                instructions: SERVER_INSTRUCTIONS,
            });

        case 'ping':
            return rpcResult(id, {});

        case 'tools/list':
            return rpcResult(id, { tools: listTools(ctx.scopes) });

        case 'tools/call':
            try {
                return rpcResult(id, await callTool(ctx, msg.params));
            } catch (err: any) {
                if (err instanceof ToolInputError) return rpcError(id, INVALID_PARAMS, err.message);
                throw err;
            }

        // Advertised-but-empty capabilities and lifecycle notifications.
        case 'resources/list':
            return rpcResult(id, { resources: [] });
        case 'resources/templates/list':
            return rpcResult(id, { resourceTemplates: [] });
        case 'prompts/list':
            return rpcResult(id, { prompts: [] });

        default:
            if (isNotification) return null;
            return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
    }
}

export async function handleMcpRequest(event: HandlerEvent): Promise<HandlerResponse> {
    const method = event.httpMethod.toUpperCase();

    if (method === 'OPTIONS') return respond(204);
    if (method === 'GET') {
        // No server-initiated streams in this stateless implementation.
        return respond(405, { error: 'This MCP server does not support SSE streams; send JSON-RPC via POST.' }, { Allow: 'POST, OPTIONS' });
    }
    if (method === 'DELETE') return respond(200);
    if (method !== 'POST') return respond(405, { error: 'Method Not Allowed' }, { Allow: 'POST, OPTIONS' });

    const headers = Object.fromEntries(Object.entries(event.headers).map(([k, v]) => [k.toLowerCase(), v]));
    const protocolHeader = negotiateProtocolVersion(headers['mcp-protocol-version']);
    const versionHeaders = { 'MCP-Protocol-Version': protocolHeader };

    const ctx = await resolvePluginContext(headers.authorization);
    if (!ctx) {
        return respond(
            401,
            rpcError(null, INVALID_REQUEST, 'Unauthorized: provide a NeuroCann API key as "Authorization: Bearer nck_...". Create one under Settings → LLM Plugin.'),
            { ...versionHeaders, 'WWW-Authenticate': 'Bearer realm="NeuroCann MCP"' },
        );
    }

    const rate = await checkRateLimit(ctx.companyId, 'mcp', 120, 60);
    if (!rate.allowed) {
        return respond(
            429,
            rpcError(null, INVALID_REQUEST, 'Rate limit exceeded'),
            { ...versionHeaders, 'Retry-After': String(rate.retryAfterSeconds ?? 60) },
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(event.body || '');
    } catch {
        return respond(400, rpcError(null, PARSE_ERROR, 'Parse error: body must be JSON'), versionHeaders);
    }

    const batch = Array.isArray(parsed);
    const messages = batch ? parsed as unknown[] : [parsed];
    if (messages.length === 0) {
        return respond(400, rpcError(null, INVALID_REQUEST, 'Invalid Request: empty batch'), versionHeaders);
    }

    const responses: Record<string, unknown>[] = [];
    for (const msg of messages) {
        if (!isRequest(msg)) {
            // Client → server responses (e.g. to sampling) are not expected here; ignore them.
            if (msg && typeof msg === 'object' && ('result' in (msg as any) || 'error' in (msg as any))) continue;
            responses.push(rpcError((msg as any)?.id ?? null, INVALID_REQUEST, 'Invalid Request'));
            continue;
        }
        try {
            const res = await dispatch(ctx, msg);
            if (res) responses.push(res);
        } catch (err: any) {
            captureError(err, { method: msg.method });
            console.error(`mcp ${msg.method} failed:`, err);
            responses.push(rpcError(msg.id ?? null, INTERNAL_ERROR, 'Internal error'));
        }
    }

    // Only notifications/responses in the body → acknowledge with no content.
    if (responses.length === 0) return respond(202, undefined, versionHeaders);

    return respond(200, batch ? responses : responses[0], versionHeaders);
}

export const handler: Handler = async (event) => {
    try {
        return await handleMcpRequest(event);
    } catch (err: any) {
        captureError(err);
        console.error('mcp handler error:', err);
        return respond(500, rpcError(null, INTERNAL_ERROR, 'Internal error'));
    }
};
