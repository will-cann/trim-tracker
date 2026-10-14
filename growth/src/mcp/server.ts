import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../config';
import type { Queryable } from '../db';
import { defaultDb, findTool, listTools, ToolInputError } from './tools';

/**
 * Growth MCP server: stateless Streamable HTTP (JSON-RPC over POST, one JSON
 * response, no sessions/SSE), same shape as netlify/functions/mcp.ts in the
 * product app. Private: every request needs `Authorization: Bearer <key>`
 * where the key is one of GROWTH_API_KEYS.
 */

const SERVER_INFO = { name: 'neurocann-growth', title: 'NeuroCann Growth', version: '0.1.0' };
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

const SERVER_INSTRUCTIONS = `NeuroCann's growth CRM: prospects (organizations + people), demo requests from the website, Claude-researched enrichment with a 0-100 fit score, state cannabis licenses, and call/demo notes. Attio is the CRM of record downstream; this server pushes to it.

Start with pipeline_summary or list_demo_requests. Look up one company with get_prospect (by domain, email or organization_id). After a call, record it with log_note. Mark demos scheduled/completed with update_demo_request and move companies through stages with update_organization. enrich_organization and sync_to_attio are queued and complete in the background.`;

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: JsonRpcId;
    method: string;
    params?: any;
}

export interface McpHttpResponse {
    status: number;
    body: string | null;
    headers: Record<string, string>;
}

function rpcResult(id: JsonRpcId, result: unknown) {
    return { jsonrpc: '2.0' as const, id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string) {
    return { jsonrpc: '2.0' as const, id, error: { code, message } };
}

function respond(status: number, body?: unknown, extra: Record<string, string> = {}): McpHttpResponse {
    if (body === undefined) return { status, body: null, headers: extra };
    return { status, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...extra } };
}

function sha256(s: string) {
    return createHash('sha256').update(s).digest();
}

/** Constant-time check of a bearer token against GROWTH_API_KEYS. */
export function isAuthorized(authHeader: string | undefined, keys = config.apiKeys): boolean {
    const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token || keys.length === 0) return false;
    const presented = sha256(token);
    return keys.some(k => timingSafeEqual(presented, sha256(k)));
}

function textContent(payload: unknown) {
    return [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }];
}

async function callTool(db: Queryable, params: any) {
    const name = params?.name;
    if (typeof name !== 'string') throw new ToolInputError('tools/call requires a tool "name"');
    const tool = findTool(name);
    if (!tool) return { content: textContent(`Unknown tool: ${name}`), isError: true };
    const args = params?.arguments && typeof params.arguments === 'object' ? params.arguments : {};
    try {
        const result = await tool.handler(db, args);
        const structured = result !== null && typeof result === 'object' && !Array.isArray(result)
            ? result as Record<string, unknown>
            : { result };
        return { content: textContent(result), structuredContent: structured };
    } catch (err: any) {
        if (err instanceof ToolInputError) return { content: textContent(err.message), isError: true };
        console.error(`[mcp] tool "${name}" failed:`, err);
        return { content: textContent(`Tool "${name}" failed: ${err?.message ?? 'unknown error'}`), isError: true };
    }
}

async function dispatch(db: Queryable, msg: JsonRpcRequest) {
    const id = msg.id ?? null;
    switch (msg.method) {
        case 'initialize': {
            const requested = msg.params?.protocolVersion;
            return rpcResult(id, {
                protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION,
                capabilities: { tools: { listChanged: false } },
                serverInfo: SERVER_INFO,
                instructions: SERVER_INSTRUCTIONS,
            });
        }
        case 'ping':
            return rpcResult(id, {});
        case 'tools/list':
            return rpcResult(id, { tools: listTools() });
        case 'tools/call':
            try {
                return rpcResult(id, await callTool(db, msg.params));
            } catch (err) {
                if (err instanceof ToolInputError) return rpcError(id, INVALID_PARAMS, err.message);
                throw err;
            }
        case 'resources/list':
            return rpcResult(id, { resources: [] });
        case 'prompts/list':
            return rpcResult(id, { prompts: [] });
        default:
            if (msg.id === undefined) return null; // notification
            return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
    }
}

function isRequest(msg: unknown): msg is JsonRpcRequest {
    return !!msg && typeof msg === 'object' && (msg as any).jsonrpc === '2.0' && typeof (msg as any).method === 'string';
}

export async function handleMcpRequest(authHeader: string | undefined, rawBody: string, db: Queryable = defaultDb()): Promise<McpHttpResponse> {
    if (!isAuthorized(authHeader)) {
        return respond(401, rpcError(null, INVALID_REQUEST, 'Unauthorized: send Authorization: Bearer <GROWTH_API_KEYS entry>'),
            { 'WWW-Authenticate': 'Bearer realm="neurocann-growth"' });
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(rawBody || '');
    } catch {
        return respond(400, rpcError(null, PARSE_ERROR, 'Parse error: body must be JSON'));
    }
    const batch = Array.isArray(parsed);
    const messages = batch ? parsed as unknown[] : [parsed];
    if (messages.length === 0) return respond(400, rpcError(null, INVALID_REQUEST, 'Invalid Request: empty batch'));

    const responses: unknown[] = [];
    for (const msg of messages) {
        if (!isRequest(msg)) {
            if (msg && typeof msg === 'object' && ('result' in (msg as any) || 'error' in (msg as any))) continue;
            responses.push(rpcError((msg as any)?.id ?? null, INVALID_REQUEST, 'Invalid Request'));
            continue;
        }
        try {
            const res = await dispatch(db, msg);
            if (res) responses.push(res);
        } catch (err) {
            console.error(`[mcp] ${msg.method} failed:`, err);
            responses.push(rpcError(msg.id ?? null, INTERNAL_ERROR, 'Internal error'));
        }
    }
    if (responses.length === 0) return respond(202);
    return respond(200, batch ? responses : responses[0]);
}
