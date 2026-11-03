import { authorize, resolveContext, type AuthenticatedContext, type Role } from './auth';
import { allowedCompanyIds, resolveMetrcCredentials, type MetrcCredentials } from './metrcConnections';

/**
 * Auth for the standalone manifest picker (/manifest) and every function that
 * talks to Metrc through T3. Every request must carry a normal Auth0 Bearer
 * token (the picker signs in with the same Auth0 app as the main UI), and the
 * caller's company must be able to reach Metrc one of two ways:
 *
 *   - it has its own Metrc connection (Settings → Metrc, `metrc_connections`), or
 *   - it is listed in MANIFEST_COMPANY_IDS on a deploy that carries T3_API_KEY.
 *
 * The allowlist matters for the deploy key because resolveContext()
 * auto-provisions a fresh company for any new Auth0 signup — without it,
 * anyone who could register would read the facility's Metrc data through the
 * site's key. A company's own key only ever reaches that company's data, so a
 * stored connection is enough on its own. DEV_BYPASS_AUTH=true skips the
 * company check for local development (credentials still resolve normally).
 */

export type ManifestAuth =
    | { ok: true; ctx: AuthenticatedContext; t3: MetrcCredentials | null }
    | { ok: false; status: number; error: string };

export interface ManifestAuthOptions {
    /** Minimum role required (admin > director > department_manager > technician). */
    minRole?: Role;
}

export { allowedCompanyIds };

export async function authorizeManifestRequest(
    headers: Record<string, string | undefined>,
    opts: ManifestAuthOptions = {},
): Promise<ManifestAuth> {
    const ctx = await resolveContext(headers.authorization);
    if (!ctx) return { ok: false, status: 401, error: 'Sign in to use the manifest picker.' };

    const t3 = await resolveMetrcCredentials(ctx.companyId);

    if (process.env.DEV_BYPASS_AUTH !== 'true' && t3?.source !== 'connection') {
        const allowed = allowedCompanyIds();
        if (!allowed) {
            return {
                ok: false,
                status: 403,
                error: `Your company has no Metrc connection. A director can add one in Settings → Metrc. (Company id ${ctx.companyId}; MANIFEST_COMPANY_IDS is unset on this deploy.)`,
            };
        }
        if (!allowed.has(ctx.companyId.toLowerCase())) {
            return {
                ok: false,
                status: 403,
                error: `Your company (${ctx.companyId}) has no Metrc connection. A director can add one in Settings → Metrc, or whoever runs the server adds it to MANIFEST_COMPANY_IDS.`,
            };
        }
    }

    if (opts.minRole && authorize(ctx, opts.minRole)) {
        return { ok: false, status: 403, error: `This needs the ${opts.minRole} role or higher; you are ${ctx.role}.` };
    }

    return { ok: true, ctx, t3 };
}

export function jsonResponse(statusCode: number, payload: unknown) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
}
