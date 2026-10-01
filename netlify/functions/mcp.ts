import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { bearerChallenge, resolvePluginAuth, OAUTH_SCOPE_READ, OAUTH_SCOPE_WRITE, type PluginContext } from './utils/apiKeys';
import { findTool, listTools, ToolInputError, type RegisteredTool } from './utils/mcpTools';
import { listWidgetResources, readWidgetResource } from './utils/mcpWidgets';
import { checkRateLimit } from './utils/rateLimit';
import { captureError } from './utils/sentry';

/**
 * NeuroCann LLM plugin — a Model Context Protocol (MCP) server.
 *
 * Implements the stateless "Streamable HTTP" transport: every JSON-RPC request
 * arrives as a POST and is answered with a single JSON response. No sessions,
 * no server-initiated SSE streams, so it fits a serverless function.
 *
 * Auth is mixed-mode so the server can be listed publicly (ChatGPT Apps
 * Directory, claude.ai connectors) and still be useful before sign-in:
 *   - anonymous callers can initialize, list tools, and call `public` tools
 *   - facility tools need an API key (`nck_...`) or an OAuth token from Auth0;
 *     calling one anonymously returns a tool error carrying
 *     `_meta["mcp/www_authenticate"]`, which is what makes ChatGPT show its
 *     account-linking UI for that tool
 *   - a presented-but-invalid credential is a hard 401 with `WWW-Authenticate`
 *     pointing at /.well-known/oauth-protected-resource (RFC 9728)
 *
 * Public planner tools also link an MCP Apps UI resource (`ui://…`, served via
 * resources/read) so hosts like ChatGPT render their results as an inline
 * card. Tools stay fully usable from the text content alone.
 * See docs/llm-plugin.md.
 */

const SERVER_INFO = { name: 'neurocann', title: 'NeuroCann', version: '1.2.0' };
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

const SERVER_INSTRUCTIONS = `NeuroCann is a cannabis cultivation and extraction operations platform. Weights are grams unless a unit is given.

Without a linked account you can use about_neurocann and the free planners: plan_extraction_inputs (demand-backward: "how much fresh frozen for 500 g of rosin?"), estimate_cost_per_gram ("what does a gram of live rosin cost me to make?"), plan_wash_schedule ("how long to wash 200 lb with one freeze dryer?"), estimate_dry_weight, estimate_harvest_yield, plan_harvest_timeline and estimate_trim_labor. Where the host renders their results as a card, summarise the takeaway and the key assumption instead of restating every figure. Facility tools (get_facility_overview, list_*, run_report, tasks) require the user to link their NeuroCann account; when one returns an authentication error, offer to connect the account rather than retrying.

Once linked: start with get_facility_overview, then use list_* tools for detail. Harvests move planning → active → submitted → drying → ready → completed; plants move nursery → vegetative → flowering → harvested. For analytics call get_report_schema and then run_report. Confirm with the user before create_task or update_task_status.`;

// JSON-RPC 2.0 error codes
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
const RESOURCE_NOT_FOUND = -32002;

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: string | number | null;
    method: string;
    params?: any;
}

type JsonRpcId = string | number | null;
type Headers = Record<string, string | undefined>;

interface RequestScope {
    ctx: PluginContext | null;
    headers: Headers;
}

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
    'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version, WWW-Authenticate',
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

/** Tool result that tells MCP hosts to start (or upgrade) account linking. */
function authChallengeResult(scope: RequestScope, tool: RegisteredTool, reason: 'unauthenticated' | 'insufficient_scope') {
    const required = tool.definition.scope === 'write' ? `${OAUTH_SCOPE_READ} ${OAUTH_SCOPE_WRITE}` : OAUTH_SCOPE_READ;
    const message = reason === 'unauthenticated'
        ? `"${tool.definition.name}" needs a linked NeuroCann account. Sign in to connect your facility, or ask about the free tools (about_neurocann, plan_extraction_inputs, estimate_dry_weight).`
        : `This credential cannot use "${tool.definition.name}" — it needs "${tool.definition.scope}" access. Re-link with write permission, or create a read & write key under Settings → LLM Plugin.`;
    const error = reason === 'unauthenticated' ? 'invalid_token' : 'insufficient_scope';
    return {
        content: textContent(message),
        isError: true,
        _meta: { 'mcp/www_authenticate': [bearerChallenge(scope.headers, error, message, required)] },
    };
}

async function callTool(scope: RequestScope, params: any) {
    const name = params?.name;
    if (typeof name !== 'string') throw new ToolInputError('tools/call requires a tool "name"');

    const tool = findTool(name);
    if (!tool) {
        return { content: textContent(`Unknown tool: ${name}`), isError: true };
    }

    const { ctx } = scope;
    if (tool.definition.scope !== 'public') {
        if (!ctx) return authChallengeResult(scope, tool, 'unauthenticated');
        if (!ctx.scopes.includes(tool.definition.scope)) return authChallengeResult(scope, tool, 'insufficient_scope');
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

async function dispatch(scope: RequestScope, msg: JsonRpcRequest): Promise<Record<string, unknown> | null> {
    const id = msg.id ?? null;
    const isNotification = msg.id === undefined;

    switch (msg.method) {
        case 'initialize':
            return rpcResult(id, {
                protocolVersion: negotiateProtocolVersion(msg.params?.protocolVersion),
                capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false } },
                serverInfo: SERVER_INFO,
                instructions: SERVER_INSTRUCTIONS,
            });

        case 'ping':
            return rpcResult(id, {});

        case 'tools/list':
            return rpcResult(id, { tools: listTools(scope.ctx ? scope.ctx.scopes : null) });

        case 'tools/call':
            try {
                return rpcResult(id, await callTool(scope, msg.params));
            } catch (err: any) {
                if (err instanceof ToolInputError) return rpcError(id, INVALID_PARAMS, err.message);
                throw err;
            }

        // UI resources (MCP Apps) are static HTML, so they are readable anonymously.
        case 'resources/list':
            return rpcResult(id, { resources: listWidgetResources() });
        case 'resources/read': {
            const uri = msg.params?.uri;
            if (typeof uri !== 'string') return rpcError(id, INVALID_PARAMS, 'resources/read requires a resource "uri"');
            const resource = readWidgetResource(uri);
            if (!resource) return rpcError(id, RESOURCE_NOT_FOUND, `Resource not found: ${uri}`, { uri });
            return rpcResult(id, resource);
        }

        // Advertised-but-empty capabilities and lifecycle notifications.
        case 'resources/templates/list':
            return rpcResult(id, { resourceTemplates: [] });
        case 'prompts/list':
            return rpcResult(id, { prompts: [] });

        default:
            if (isNotification) return null;
            return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
    }
}

function lowerHeaders(event: HandlerEvent): Headers {
    return Object.fromEntries(Object.entries(event.headers).map(([k, v]) => [k.toLowerCase(), v]));
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

    const headers = lowerHeaders(event);
    const protocolHeader = negotiateProtocolVersion(headers['mcp-protocol-version']);
    const versionHeaders = { 'MCP-Protocol-Version': protocolHeader };

    const auth = await resolvePluginAuth(headers);
    if (auth.status === 'invalid') {
        const description = 'The credential is invalid, expired or revoked. Sign in again, or create a new key under Settings → LLM Plugin.';
        return respond(
            401,
            rpcError(null, INVALID_REQUEST, `Unauthorized: ${description}`),
            { ...versionHeaders, 'WWW-Authenticate': bearerChallenge(headers, 'invalid_token', description, OAUTH_SCOPE_READ) },
        );
    }
    const scope: RequestScope = { ctx: auth.status === 'ok' ? auth.ctx : null, headers };

    // Anonymous traffic only reaches database-free public tools, so the
    // per-company limiter applies to authenticated callers.
    if (scope.ctx) {
        const rate = await checkRateLimit(scope.ctx.companyId, 'mcp', 120, 60);
        if (!rate.allowed) {
            return respond(
                429,
                rpcError(null, INVALID_REQUEST, 'Rate limit exceeded'),
                { ...versionHeaders, 'Retry-After': String(rate.retryAfterSeconds ?? 60) },
            );
        }
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
            const res = await dispatch(scope, msg);
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
