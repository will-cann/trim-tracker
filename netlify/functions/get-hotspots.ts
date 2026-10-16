import { Handler } from '@netlify/functions';
import { resolveContext } from './utils/auth';
import { normalizeContaminant } from '../../shared/plantMap/health';
import { buildHotspotSummary } from './utils/plantMap';

/**
 * GET /get-hotspots?days=90&contaminant=botrytis
 *
 * Facility-wide view of where and on what the trouble is: per room (active
 * count, count in window, hottest cells) and per strain (incidence = plants
 * affected / plants that flowered in the window). Defaults to botrytis over
 * the last 90 days; contaminant=all counts every spreading issue; days=all
 * removes the window.
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const q = event.queryStringParameters ?? {};
        const rawDays = q.days === 'all' ? null : parseInt(q.days ?? '90', 10);
        const days = rawDays && rawDays > 0 ? rawDays : null;
        const contaminant = !q.contaminant || q.contaminant === 'botrytis'
            ? 'botrytis'
            : q.contaminant === 'all' ? null : normalizeContaminant(q.contaminant);
        if (q.contaminant && q.contaminant !== 'all' && !contaminant) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Unknown contaminant.' }) };
        }

        const summary = await buildHotspotSummary(context.companyId, { days, contaminant });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(summary),
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Error fetching hotspots:', msg);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch hotspots', detail: msg }) };
    }
};
