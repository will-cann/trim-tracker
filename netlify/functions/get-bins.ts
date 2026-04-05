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

        const statusFilter = event.queryStringParameters?.status;
        const harvestId = event.queryStringParameters?.harvestId;

        let rows: any[];

        if (harvestId && statusFilter) {
            const result = await sql`
                SELECT b.*, h.batch_id AS harvest_batch_id
                FROM harvest_bins b
                JOIN harvests h ON b.harvest_id = h.id
                WHERE b.company_id = ${context.companyId}
                  AND b.harvest_id = ${harvestId}
                  AND b.status = ${statusFilter}
                ORDER BY b.bin_number ASC
            `;
            rows = result.rows;
        } else if (harvestId) {
            const result = await sql`
                SELECT b.*, h.batch_id AS harvest_batch_id
                FROM harvest_bins b
                JOIN harvests h ON b.harvest_id = h.id
                WHERE b.company_id = ${context.companyId}
                  AND b.harvest_id = ${harvestId}
                ORDER BY b.bin_number ASC
            `;
            rows = result.rows;
        } else if (statusFilter) {
            const result = await sql`
                SELECT b.*, h.batch_id AS harvest_batch_id
                FROM harvest_bins b
                JOIN harvests h ON b.harvest_id = h.id
                WHERE b.company_id = ${context.companyId}
                  AND b.status = ${statusFilter}
                ORDER BY b.created_at DESC
            `;
            rows = result.rows;
        } else {
            const result = await sql`
                SELECT b.*, h.batch_id AS harvest_batch_id
                FROM harvest_bins b
                JOIN harvests h ON b.harvest_id = h.id
                WHERE b.company_id = ${context.companyId}
                ORDER BY b.created_at DESC
            `;
            rows = result.rows;
        }

        // Fetch latest cure log per bin for next_action_at
        const binIds = rows.map(r => r.id);
        let latestLogs: any[] = [];
        if (binIds.length > 0) {
            const logResult = await sql`
                SELECT DISTINCT ON (bin_id) bin_id, action, next_action_at, created_at
                FROM bin_cure_logs
                WHERE bin_id = ANY(${binIds})
                ORDER BY bin_id, created_at DESC
            `;
            latestLogs = logResult.rows;
        }

        const logMap = new Map(latestLogs.map(l => [l.bin_id, l]));

        const result = rows.map((b: any) => {
            const latestLog = logMap.get(b.id);
            return {
                id: b.id,
                harvestId: b.harvest_id,
                harvestBatchId: b.harvest_batch_id,
                binNumber: b.bin_number,
                strain: b.strain,
                licenseNumber: b.license_number,
                weight: b.weight ? parseFloat(b.weight) : null,
                status: b.status,
                location: b.location,
                buckedAt: b.bucked_at,
                readyAt: b.ready_at,
                trimEntryId: b.trim_entry_id,
                createdAt: b.created_at,
                updatedAt: b.updated_at,
                nextActionAt: latestLog?.next_action_at || null,
                lastCureAction: latestLog?.action || null,
                lastCureAt: latestLog?.created_at || null,
            };
        });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result),
        };
    } catch (error) {
        console.error('Error fetching bins:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch bins' }),
        };
    }
};
