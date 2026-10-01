import { timingSafeEqual } from 'crypto';
import { resolveContext } from './auth';

/**
 * Auth for the standalone manifest picker (/manifest), which has no Auth0
 * session. Accepts either a normal Bearer token or the shared access code
 * from MANIFEST_ACCESS_CODE in `x-manifest-key`. When neither is configured
 * (and DEV_BYPASS_AUTH is off) the endpoint is disabled rather than open.
 */
export type ManifestAuth = { ok: true } | { ok: false; status: number; error: string };

function codeMatches(provided: string | undefined, expected: string | undefined): boolean {
    if (!provided || !expected) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

export async function authorizeManifestRequest(headers: Record<string, string | undefined>): Promise<ManifestAuth> {
    const bearer = headers.authorization;
    if (bearer) {
        const ctx = await resolveContext(bearer);
        if (ctx) return { ok: true };
    }

    const expected = process.env.MANIFEST_ACCESS_CODE;
    if (!expected) {
        if (process.env.DEV_BYPASS_AUTH === 'true') return { ok: true };
        return { ok: false, status: 403, error: 'This feature is not enabled on this deploy (MANIFEST_ACCESS_CODE unset).' };
    }
    if (codeMatches(headers['x-manifest-key'], expected)) return { ok: true };
    return { ok: false, status: 401, error: 'Access code is missing or wrong. Set it under Settings → Email export.' };
}

export function jsonResponse(statusCode: number, payload: unknown) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
}
