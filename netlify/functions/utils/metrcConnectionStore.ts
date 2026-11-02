import { sql } from './db';
import type { T3Mode } from '../../../shared/manifest/t3';
import type { MetrcConnectionState } from '../../../shared/manifest/metrcConnection';

/**
 * Database access for `metrc_connections` (migration 070). Kept separate from
 * the rules in metrcConnections.ts so handlers can be tested with this module
 * mocked and no database.
 */

export interface ConnectionLicense {
    licenseNumber: string;
    licenseName: string;
}

export interface ConnectionRow {
    id: string;
    company_id: string;
    api_key_encrypted: string;
    api_key_hint: string;
    mode: T3Mode;
    status: MetrcConnectionState;
    metrc_username: string | null;
    metrc_hostname: string | null;
    has_t3plus: boolean | null;
    t3plus_tier: string | null;
    api_access_level: string | null;
    licenses: ConnectionLicense[];
    sync_licenses: string[] | null;
    last_verified_at: string | null;
    last_synced_at: string | null;
    last_error: string | null;
    last_error_at: string | null;
    created_by: string | null;
    created_by_name: string | null;
    created_at: string;
    updated_at: string;
}

/** What T3's whoami + licences say about the login behind a key. */
export interface ConnectionIdentity {
    username: string | null;
    hostname: string | null;
    hasT3plus: boolean | null;
    tier: string | null;
    apiAccessLevel: string | null;
    licenses: ConnectionLicense[];
}

const toRow = (r: any): ConnectionRow => ({
    ...r,
    licenses: Array.isArray(r.licenses) ? r.licenses : [],
    sync_licenses: Array.isArray(r.sync_licenses) ? r.sync_licenses : null,
});

export async function findConnection(companyId: string): Promise<ConnectionRow | null> {
    const { rows } = await sql`
        SELECT c.id, c.company_id, c.api_key_encrypted, c.api_key_hint, c.mode, c.status,
               c.metrc_username, c.metrc_hostname, c.has_t3plus, c.t3plus_tier, c.api_access_level,
               c.licenses, c.sync_licenses, c.last_verified_at, c.last_synced_at, c.last_error, c.last_error_at,
               c.created_by, u.name AS created_by_name, c.created_at, c.updated_at
          FROM metrc_connections c
          LEFT JOIN users u ON u.id = c.created_by
         WHERE c.company_id = ${companyId}
    `;
    return rows[0] ? toRow(rows[0]) : null;
}

/** Companies whose scheduled sync should run. */
export async function activeConnectionCompanyIds(): Promise<string[]> {
    const { rows } = await sql`SELECT company_id FROM metrc_connections WHERE status = 'active' ORDER BY created_at`;
    return rows.map((r: any) => String(r.company_id));
}

export interface SaveConnectionInput {
    companyId: string;
    apiKeyEncrypted: string;
    apiKeyHint: string;
    mode: T3Mode;
    identity: ConnectionIdentity;
    createdBy: string | null;
}

/** Insert, or replace the key on an existing connection (rotation keeps mode, status and licence choice). */
export async function saveConnection(input: SaveConnectionInput): Promise<ConnectionRow> {
    const { companyId, apiKeyEncrypted, apiKeyHint, mode, identity, createdBy } = input;
    await sql`
        INSERT INTO metrc_connections (
            company_id, api_key_encrypted, api_key_hint, mode, status,
            metrc_username, metrc_hostname, has_t3plus, t3plus_tier, api_access_level, licenses,
            last_verified_at, last_error, last_error_at, created_by
        ) VALUES (
            ${companyId}, ${apiKeyEncrypted}, ${apiKeyHint}, ${mode}, 'active',
            ${identity.username}, ${identity.hostname}, ${identity.hasT3plus}, ${identity.tier}, ${identity.apiAccessLevel},
            ${JSON.stringify(identity.licenses)}::jsonb,
            NOW(), NULL, NULL, ${createdBy}
        )
        ON CONFLICT (company_id) DO UPDATE SET
            api_key_encrypted = EXCLUDED.api_key_encrypted,
            api_key_hint = EXCLUDED.api_key_hint,
            mode = EXCLUDED.mode,
            metrc_username = EXCLUDED.metrc_username,
            metrc_hostname = EXCLUDED.metrc_hostname,
            has_t3plus = EXCLUDED.has_t3plus,
            t3plus_tier = EXCLUDED.t3plus_tier,
            api_access_level = EXCLUDED.api_access_level,
            licenses = EXCLUDED.licenses,
            last_verified_at = NOW(),
            last_error = NULL,
            last_error_at = NULL,
            updated_at = NOW()
    `;
    return (await findConnection(companyId))!;
}

export async function recordVerification(companyId: string, identity: ConnectionIdentity): Promise<void> {
    await sql`
        UPDATE metrc_connections SET
            metrc_username = ${identity.username}, metrc_hostname = ${identity.hostname},
            has_t3plus = ${identity.hasT3plus}, t3plus_tier = ${identity.tier}, api_access_level = ${identity.apiAccessLevel},
            licenses = ${JSON.stringify(identity.licenses)}::jsonb,
            last_verified_at = NOW(), last_error = NULL, last_error_at = NULL, updated_at = NOW()
         WHERE company_id = ${companyId}
    `;
}

export async function recordConnectionError(companyId: string, message: string): Promise<void> {
    await sql`
        UPDATE metrc_connections SET last_error = ${message}, last_error_at = NOW(), updated_at = NOW()
         WHERE company_id = ${companyId}
    `;
}

export async function recordSynced(companyId: string): Promise<void> {
    await sql`UPDATE metrc_connections SET last_synced_at = NOW(), last_error = NULL, last_error_at = NULL, updated_at = NOW() WHERE company_id = ${companyId}`;
}

export interface ConnectionPatch {
    mode?: T3Mode;
    status?: MetrcConnectionState;
    syncLicenses?: string[] | null;
}

export async function patchConnection(companyId: string, patch: ConnectionPatch): Promise<void> {
    if (patch.mode !== undefined) {
        await sql`UPDATE metrc_connections SET mode = ${patch.mode}, updated_at = NOW() WHERE company_id = ${companyId}`;
    }
    if (patch.status !== undefined) {
        await sql`UPDATE metrc_connections SET status = ${patch.status}, updated_at = NOW() WHERE company_id = ${companyId}`;
    }
    if (patch.syncLicenses !== undefined) {
        const value = patch.syncLicenses === null ? null : JSON.stringify(patch.syncLicenses);
        await sql`UPDATE metrc_connections SET sync_licenses = ${value}::jsonb, updated_at = NOW() WHERE company_id = ${companyId}`;
    }
}

export async function deleteConnection(companyId: string): Promise<boolean> {
    const { rows } = await sql`DELETE FROM metrc_connections WHERE company_id = ${companyId} RETURNING id`;
    return rows.length > 0;
}
