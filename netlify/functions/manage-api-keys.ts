import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext, authorize } from './utils/auth';
import { generateApiKey, type ApiKeyScope } from './utils/apiKeys';

/**
 * CRUD for LLM plugin API keys (Settings → LLM Plugin).
 *   GET    → list keys for the company (hash never returned)
 *   POST   → { name, scopes } → creates a key; the plaintext is returned once
 *   DELETE → { id } → revokes a key
 */

const VALID_SCOPES: ApiKeyScope[] = ['read', 'write'];

function json(statusCode: number, payload: unknown) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
}

function toClient(row: any) {
    return {
        id: row.id,
        name: row.name,
        keyPrefix: row.key_prefix,
        scopes: row.scopes,
        createdBy: row.created_by_name || undefined,
        lastUsedAt: row.last_used_at || undefined,
        revokedAt: row.revoked_at || undefined,
        createdAt: row.created_at,
    };
}

export const handler: Handler = async (event) => {
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) return json(401, { error: 'Unauthorized' });

        // Keys act with the full data access of the company, so only leadership can mint them.
        const denied = authorize(context, 'director');
        if (denied) return denied;

        if (event.httpMethod === 'GET') {
            const { rows } = await sql`
                SELECT k.*, u.name AS created_by_name
                FROM api_keys k
                LEFT JOIN users u ON u.id = k.user_id
                WHERE k.company_id = ${context.companyId}
                ORDER BY k.created_at DESC
            `;
            return json(200, rows.map(toClient));
        }

        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const name = typeof body.name === 'string' ? body.name.trim().slice(0, 255) : '';
            if (!name) return json(400, { error: 'name is required' });

            const requested: unknown[] = Array.isArray(body.scopes) ? body.scopes : ['read'];
            const scopes = Array.from(new Set(requested.filter((s): s is ApiKeyScope => VALID_SCOPES.includes(s as ApiKeyScope))));
            if (scopes.length === 0) return json(400, { error: 'scopes must include "read" and/or "write"' });
            if (!scopes.includes('read')) scopes.unshift('read');

            const { key, prefix, hash } = generateApiKey();
            const { rows } = await sql`
                INSERT INTO api_keys (company_id, user_id, name, key_prefix, key_hash, scopes)
                VALUES (${context.companyId}, ${context.userId}, ${name}, ${prefix}, ${hash}, ${scopes})
                RETURNING *
            `;
            return json(201, { ...toClient(rows[0]), key });
        }

        if (event.httpMethod === 'DELETE') {
            const body = JSON.parse(event.body || '{}');
            if (!body.id) return json(400, { error: 'id is required' });
            const { rows } = await sql`
                UPDATE api_keys SET revoked_at = NOW()
                WHERE id = ${body.id} AND company_id = ${context.companyId} AND revoked_at IS NULL
                RETURNING id
            `;
            if (rows.length === 0) return json(404, { error: 'Key not found' });
            return json(200, { success: true });
        }

        return { statusCode: 405, body: 'Method Not Allowed' };
    } catch (error) {
        console.error('manage-api-keys error:', error);
        return json(500, { error: 'Failed to manage API keys' });
    }
};
