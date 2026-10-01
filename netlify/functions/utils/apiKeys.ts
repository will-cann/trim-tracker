import { createHash, randomBytes } from 'crypto';
import { sql } from './db';
import { resolveContext, type AuthenticatedContext } from './auth';

export const API_KEY_PREFIX = 'nck_';
export type ApiKeyScope = 'read' | 'write';

/** Auth context for a request made through the LLM plugin (MCP) endpoint. */
export interface PluginContext extends AuthenticatedContext {
    scopes: ApiKeyScope[];
    /** 'api_key' when authenticated via a plugin key, 'session' for an Auth0 token or dev bypass. */
    via: 'api_key' | 'session';
    apiKeyId?: string;
}

export function hashApiKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
    const key = API_KEY_PREFIX + randomBytes(24).toString('base64url');
    return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

export function isApiKey(token: string | undefined): token is string {
    return !!token && token.startsWith(API_KEY_PREFIX);
}

function bearerToken(authHeader?: string): string | undefined {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return undefined;
    return authHeader.slice('Bearer '.length).trim();
}

/**
 * Resolve the caller for the MCP endpoint. Accepts either a NeuroCann plugin
 * API key (`nck_...`) or a regular Auth0 Bearer token. Falls through to the
 * normal `resolveContext` so DEV_BYPASS_AUTH keeps working locally.
 */
export async function resolvePluginContext(authHeader?: string): Promise<PluginContext | null> {
    const token = bearerToken(authHeader);

    if (isApiKey(token)) {
        const { rows } = await sql`
            SELECT k.id, k.company_id, k.user_id, k.scopes, u.role, u.departments
            FROM api_keys k
            JOIN users u ON u.id = k.user_id
            WHERE k.key_hash = ${hashApiKey(token)}
              AND k.revoked_at IS NULL
        `;
        if (rows.length === 0) return null;
        const row = rows[0];

        // Best-effort usage tracking; never fail the request on it.
        sql`UPDATE api_keys SET last_used_at = NOW() WHERE id = ${row.id}`.catch(() => {});

        return {
            userId: row.user_id,
            companyId: row.company_id,
            role: row.role,
            departments: row.departments || [],
            scopes: (row.scopes || ['read']) as ApiKeyScope[],
            via: 'api_key',
            apiKeyId: row.id,
        };
    }

    const ctx = await resolveContext(authHeader);
    if (!ctx) return null;
    return { ...ctx, scopes: ['read', 'write'], via: 'session' };
}
