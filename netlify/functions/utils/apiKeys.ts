import { createHash, randomBytes } from 'crypto';
import { sql } from './db';
import { contextForAuth0User, verifyToken, DEV_BYPASS_CONTEXT, type AuthenticatedContext } from './auth';

export const API_KEY_PREFIX = 'nck_';
export type ApiKeyScope = 'read' | 'write';

/** OAuth scopes advertised to MCP clients (defined on the Auth0 API for the MCP resource). */
export const OAUTH_SCOPE_READ = 'read:facility';
export const OAUTH_SCOPE_WRITE = 'write:tasks';

/** Auth context for a request made through the LLM plugin (MCP) endpoint. */
export interface PluginContext extends AuthenticatedContext {
    scopes: ApiKeyScope[];
    /** 'api_key' for a plugin key, 'oauth' for a token minted for the MCP resource, 'session' for an app token or dev bypass. */
    via: 'api_key' | 'oauth' | 'session';
    apiKeyId?: string;
}

export type PluginAuthResult =
    | { status: 'ok'; ctx: PluginContext }
    | { status: 'anonymous' }
    | { status: 'invalid' };

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

// ── OAuth resource metadata (RFC 9728) ────────────────────────────────────────

function publicOrigin(headers: Record<string, string | undefined>): string {
    const proto = headers['x-forwarded-proto'] || 'https';
    const host = headers['x-forwarded-host'] || headers.host || 'localhost';
    return `${proto}://${host}`;
}

/**
 * Canonical identifier of the MCP server — what OAuth clients send as the
 * RFC 8707 `resource` parameter and what the Auth0 API identifier must equal.
 * Override with MCP_RESOURCE when the public host differs from the request host.
 */
export function mcpResourceUrl(headers: Record<string, string | undefined>): string {
    return process.env.MCP_RESOURCE || `${publicOrigin(headers)}/mcp`;
}

export function resourceMetadataUrl(headers: Record<string, string | undefined>): string {
    return `${publicOrigin(headers)}/.well-known/oauth-protected-resource`;
}

export function authorizationServerIssuer(): string | null {
    const domain = process.env.AUTH0_DOMAIN;
    return domain ? `https://${domain}/` : null;
}

export function protectedResourceMetadata(headers: Record<string, string | undefined>) {
    const issuer = authorizationServerIssuer();
    return {
        resource: mcpResourceUrl(headers),
        authorization_servers: issuer ? [issuer] : [],
        bearer_methods_supported: ['header'],
        scopes_supported: ['openid', 'profile', 'email', 'offline_access', OAUTH_SCOPE_READ, OAUTH_SCOPE_WRITE],
        resource_name: 'NeuroCann',
        resource_documentation: `${publicOrigin(headers)}/docs/llm-plugin`,
    };
}

/** `WWW-Authenticate` value for 401s and for `_meta["mcp/www_authenticate"]` tool challenges. */
export function bearerChallenge(headers: Record<string, string | undefined>, error: string, description: string, scope?: string): string {
    const parts = [
        `Bearer resource_metadata="${resourceMetadataUrl(headers)}"`,
        `error="${error}"`,
        `error_description="${description.replace(/"/g, "'")}"`,
    ];
    if (scope) parts.push(`scope="${scope}"`);
    return parts.join(', ');
}

// ── Resolution ────────────────────────────────────────────────────────────────

function scopesFromOAuthToken(payload: Record<string, unknown>): ApiKeyScope[] {
    const raw = typeof payload.scope === 'string' ? payload.scope.split(/\s+/) : [];
    const permissions = Array.isArray(payload.permissions) ? payload.permissions.map(String) : [];
    const granted = new Set([...raw, ...permissions]);
    const scopes: ApiKeyScope[] = ['read'];
    if (granted.has(OAUTH_SCOPE_WRITE)) scopes.push('write');
    return scopes;
}

/**
 * Resolve the caller for the MCP endpoint. Accepts, in order:
 *   - a NeuroCann plugin API key (`nck_...`)
 *   - an Auth0 access token minted for the MCP resource (OAuth clients such as
 *     ChatGPT / claude.ai) — scopes come from the token
 *   - an Auth0 access token for the app API (in-app session) — full access
 *   - DEV_BYPASS_AUTH for local development
 * Returns `anonymous` when no credential is presented and `invalid` when one is
 * presented but does not verify.
 */
export async function resolvePluginAuth(headers: Record<string, string | undefined>): Promise<PluginAuthResult> {
    const token = bearerToken(headers.authorization);

    if (process.env.DEV_BYPASS_AUTH === 'true') {
        return { status: 'ok', ctx: { ...DEV_BYPASS_CONTEXT, scopes: ['read', 'write'], via: 'session' } };
    }

    if (!token) return { status: 'anonymous' };

    if (isApiKey(token)) {
        const { rows } = await sql`
            SELECT k.id, k.company_id, k.user_id, k.scopes, u.role, u.departments
            FROM api_keys k
            JOIN users u ON u.id = k.user_id
            WHERE k.key_hash = ${hashApiKey(token)}
              AND k.revoked_at IS NULL
        `;
        if (rows.length === 0) return { status: 'invalid' };
        const row = rows[0];

        // Best-effort usage tracking; never fail the request on it.
        sql`UPDATE api_keys SET last_used_at = NOW() WHERE id = ${row.id}`.catch(() => {});

        return {
            status: 'ok',
            ctx: {
                userId: row.user_id,
                companyId: row.company_id,
                role: row.role,
                departments: row.departments || [],
                scopes: (row.scopes || ['read']) as ApiKeyScope[],
                via: 'api_key',
                apiKeyId: row.id,
            },
        };
    }

    const resource = mcpResourceUrl(headers);
    const auth0User = await verifyToken(headers.authorization, [resource]);
    if (!auth0User) return { status: 'invalid' };

    const ctx = await contextForAuth0User(auth0User);
    if (!ctx) return { status: 'invalid' };

    const aud = Array.isArray(auth0User.aud) ? auth0User.aud : [auth0User.aud];
    const isMcpAudience = aud.includes(resource);
    return {
        status: 'ok',
        ctx: isMcpAudience
            ? { ...ctx, scopes: scopesFromOAuthToken(auth0User), via: 'oauth' }
            : { ...ctx, scopes: ['read', 'write'], via: 'session' },
    };
}