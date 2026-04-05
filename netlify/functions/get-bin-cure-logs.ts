import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const binId = event.queryStringParameters?.binId;
        if (!binId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'binId query param is required' }) };
        }

        // Verify bin ownership
        const binResult = await sql`
            SELECT id FROM harvest_bins WHERE id = ${binId} AND company_id = ${context.companyId}
        `;
        if (binResult.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Bin not found' }) };
        }

        const logsResult = await sql`
            SELECT cl.*, u.name AS recorded_by_name
            FROM bin_cure_logs cl
            LEFT JOIN users u ON cl.recorded_by = u.id
            WHERE cl.bin_id = ${binId}
            ORDER BY cl.created_at DESC
        `;

        const logs = logsResult.rows.map((l: any) => ({
            id: l.id,
            binId: l.bin_id,
            action: l.action,
            notes: l.notes,
            moistureReading: l.moisture_reading ? parseFloat(l.moisture_reading) : null,
            recordedBy: l.recorded_by,
            recordedByName: l.recorded_by_name,
            nextActionAt: l.next_action_at,
            createdAt: l.created_at,
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logs),
        };
    } catch (error) {
        console.error('Error fetching bin cure logs:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch cure logs' }),
        };
    }
};
