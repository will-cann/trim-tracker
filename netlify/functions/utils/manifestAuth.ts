import { authorize, resolveContext, type AuthenticatedContext, type Role } from './auth';

/**
 * Auth for the standalone manifest picker (/manifest). Every request must carry
 * a normal Auth0 Bearer token (the picker signs in with the same Auth0 app as
 * the main UI), and the caller's company must be listed in MANIFEST_COMPANY_IDS.
 *
 * The allowlist matters because resolveContext() auto-provisions a fresh company
 * for any new Auth0 signup — without it, anyone who could register would be able
 * to read the facility's Metrc data through the T3 key. Unset = picker disabled.
 * DEV_BYPASS_AUTH=true skips both checks for local development.
 */

export type ManifestAuth = { ok: true; ctx: AuthenticatedContext } | { ok: false; status: number; error: string };

export interface ManifestAuthOptions {
    /** Minimum role required (admin > director > department_manager > technician). */
    minRole?: Role;
}

export function allowedCompanyIds(): Set<string> | null {
    const raw = process.env.MANIFEST_COMPANY_IDS;
    if (!raw || !raw.trim()) return null;
    return new Set(raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
}

export async function authorizeManifestRequest(
    headers: Record<string, string | undefined>,
    opts: ManifestAuthOptions = {},
): Promise<ManifestAuth> {
    const ctx = await resolveContext(headers.authorization);
    if (!ctx) return { ok: false, status: 401, error: 'Sign in to use the manifest picker.' };

    if (process.env.DEV_BYPASS_AUTH !== 'true') {
        const allowed = allowedCompanyIds();
        if (!allowed) {
            return { ok: false, status: 403, error: 'The manifest picker is not enabled on this deploy (MANIFEST_COMPANY_IDS unset).' };
        }
        if (!allowed.has(ctx.companyId.toLowerCase())) {
            return {
                ok: false,
                status: 403,
                error: `Your company (${ctx.companyId}) is not enabled for the manifest picker. Whoever runs the server adds it to MANIFEST_COMPANY_IDS.`,
            };
        }
    }

    if (opts.minRole && authorize(ctx, opts.minRole)) {
        return { ok: false, status: 403, error: `This needs the ${opts.minRole} role or higher; you are ${ctx.role}.` };
    }

    return { ok: true, ctx };
}

export function jsonResponse(statusCode: number, payload: unknown) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
}
