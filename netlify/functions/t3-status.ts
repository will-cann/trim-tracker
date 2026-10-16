import { Handler } from '@netlify/functions';
import { authorizeManifestRequest, jsonResponse as json } from './utils/manifestAuth';
import { grantsAction, isT3Configured, t3Licenses, t3Mode, t3PackagePermissions, T3Error, t3WhoAmI } from './utils/t3';
import type { T3License, T3Status } from '../../shared/manifest/t3';

/**
 * Reports whether this deploy can talk to Metrc through T3: which Metrc login
 * the key is bound to, its T3+ subscription, the licences it can see, and
 * whether Metrc lets it create transfers on each. Read-only; used by the
 * manifest picker's Settings and Review screens.
 */

const MAX_PERMISSION_CHECKS = 6;

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const auth = await authorizeManifestRequest(event.headers);
        if (!auth.ok) return json(auth.status, { error: auth.error });

        const mode = t3Mode();
        if (!isT3Configured()) {
            const body: T3Status = { configured: false, mode, connected: false };
            return json(200, body);
        }

        let who;
        try {
            who = await t3WhoAmI();
        } catch (err) {
            const message = err instanceof T3Error ? err.message : 'Could not reach T3.';
            const body: T3Status = { configured: true, mode, connected: false, error: message };
            return json(200, body);
        }

        let licenses: T3License[] = [];
        let error: string | undefined;
        try {
            const list = await t3Licenses();
            licenses = list.map(l => ({ licenseNumber: l.licenseNumber, licenseName: l.licenseName, canCreateTransfer: null }));
            await Promise.all(
                licenses.slice(0, MAX_PERMISSION_CHECKS).map(async l => {
                    try {
                        l.canCreateTransfer = grantsAction(await t3PackagePermissions(l.licenseNumber), 'new_transfer');
                    } catch {
                        l.canCreateTransfer = null;
                    }
                }),
            );
        } catch (err) {
            error = err instanceof T3Error ? err.message : 'Could not list licences.';
        }

        const body: T3Status = {
            configured: true,
            mode,
            connected: true,
            username: who.username,
            hostname: who.hostname,
            hasT3plus: who.hasT3plus,
            subscriptionTier: who.t3plusSubscriptionTier ?? null,
            subscriptionStatus: who.subscriptionStatus ?? null,
            apiAccessLevel: who.t3plusApiAccessLevel ?? null,
            licenses,
            error,
        };
        return json(200, body);
    } catch (error) {
        console.error('t3-status error:', error);
        return json(500, { error: 'Internal server error' });
    }
};
