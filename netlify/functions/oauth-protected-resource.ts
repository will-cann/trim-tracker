import type { Handler } from '@netlify/functions';
import { protectedResourceMetadata } from './utils/apiKeys';

/**
 * GET /.well-known/oauth-protected-resource — RFC 9728 discovery document for
 * the LLM plugin (MCP server at /mcp). OAuth-capable hosts (ChatGPT, claude.ai)
 * read this to find the Auth0 tenant that issues tokens for the server.
 */
export const handler: Handler = async (event) => {
    const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept, MCP-Protocol-Version',
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
    if (event.httpMethod !== 'GET') return { statusCode: 405, headers: { ...cors, Allow: 'GET, OPTIONS' }, body: '' };

    const headers = Object.fromEntries(Object.entries(event.headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
        statusCode: 200,
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
        body: JSON.stringify(protectedResourceMetadata(headers)),
    };
};
