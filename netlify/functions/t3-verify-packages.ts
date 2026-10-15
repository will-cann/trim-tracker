import { Handler } from '@netlify/functions';
import { authorizeManifestRequest, jsonResponse as json } from './utils/manifestAuth';
import { isT3Configured, t3ActivePackages, t3EligibleTransferPackages, t3Licenses, t3Mode, T3Error, type T3Package } from './utils/t3';
import { classifyPackages, isMetrcTag } from './utils/t3Transfer';
import type { T3VerifyRequest, T3VerifyResponse } from '../../shared/manifest/t3';

/**
 * Looks up scanned case tags in Metrc (via T3) and returns what each package
 * actually contains — item, quantity, parent lot, lab state — plus whether it
 * is eligible for a transfer from the chosen origin licence. The picker then
 * reconciles that against the Apex pick list and invoice. Read-only.
 */

const MAX_TAGS = 400;
const MAX_OTHER_LICENSES = 6;
const LICENSE_RE = /^[A-Z0-9-]{3,32}$/i;

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const auth = await authorizeManifestRequest(event.headers);
        if (!auth.ok) return json(auth.status, { error: auth.error });
        if (!isT3Configured()) return json(503, { error: 'Metrc lookups are not enabled on this deploy (T3_API_KEY unset).', code: 'NOT_CONFIGURED' });

        const body: Partial<T3VerifyRequest> = JSON.parse(event.body || '{}');
        const licenseNumber = (body.licenseNumber ?? '').trim();
        if (!LICENSE_RE.test(licenseNumber)) return json(400, { error: 'Pick an origin licence first.' });

        const tags = Array.from(new Set((Array.isArray(body.tags) ? body.tags : []).map(t => String(t).trim().toUpperCase())));
        if (tags.length === 0) return json(400, { error: 'No tags to check — scan some packages first.' });
        if (tags.length > MAX_TAGS) return json(400, { error: `Too many tags (max ${MAX_TAGS}).` });
        const bad = tags.filter(t => !isMetrcTag(t));
        if (bad.length) return json(400, { error: `Not Metrc tags: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? '…' : ''}`, tags: bad });

        const eligible = await t3EligibleTransferPackages(licenseNumber, tags);
        let missing = tags.filter(t => !eligible.has(t));

        const active = missing.length ? await t3ActivePackages(licenseNumber, missing) : new Map<string, T3Package>();
        missing = missing.filter(t => !active.has(t));

        // Misses are often "right package, wrong origin licence". Look on the other
        // licences in the order first, then anything else the account can see.
        const elsewhere: Array<{ licenseNumber: string; packages: Map<string, T3Package> }> = [];
        if (missing.length) {
            const requested = (Array.isArray(body.otherLicenses) ? body.otherLicenses : [])
                .map(l => String(l).trim())
                .filter(l => LICENSE_RE.test(l) && l.toUpperCase() !== licenseNumber.toUpperCase());
            let candidates = Array.from(new Set(requested));
            if (candidates.length < MAX_OTHER_LICENSES) {
                try {
                    const all = (await t3Licenses()).map(l => l.licenseNumber).filter(l => l.toUpperCase() !== licenseNumber.toUpperCase());
                    candidates = Array.from(new Set([...candidates, ...all]));
                } catch {
                    /* licence list is a nicety; keep going with what the client sent */
                }
            }
            for (const other of candidates.slice(0, MAX_OTHER_LICENSES)) {
                if (!missing.length) break;
                try {
                    const found = await t3EligibleTransferPackages(other, missing);
                    if (found.size) {
                        elsewhere.push({ licenseNumber: other, packages: found });
                        missing = missing.filter(t => !found.has(t));
                    }
                } catch {
                    /* no access to that licence; not an error for this check */
                }
            }
        }

        const response: T3VerifyResponse = {
            licenseNumber,
            mode: t3Mode(),
            checkedAt: new Date().toISOString(),
            results: classifyPackages(tags, licenseNumber, eligible, active, elsewhere),
        };
        return json(200, response);
    } catch (error) {
        if (error instanceof T3Error) {
            console.error('t3-verify-packages: T3 error', error.status, error.code, error.detail);
            return json(error.status >= 500 ? 502 : error.status, { error: error.message, code: error.code });
        }
        console.error('t3-verify-packages error:', error);
        return json(500, { error: 'Internal server error' });
    }
};
