import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext, authorize } from './utils/auth';

const VALID_STATUSES = ['curing', 'ready', 'in_trim', 'completed'];

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const denied = authorize(context, 'lead');
        if (denied) return denied;

        const { binId, ...updates } = JSON.parse(event.body || '{}');

        if (!binId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'binId is required' }) };
        }

        if (updates.status !== undefined && !VALID_STATUSES.includes(updates.status)) {
            return { statusCode: 400, body: JSON.stringify({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }) };
        }

        const allowedFields: Record<string, string> = {
            status: 'status',
            weight: 'weight',
            location: 'location',
        };

        const setClauses: string[] = [];
        const values: any[] = [binId, context.companyId];
        let paramIdx = 3;

        for (const [key, val] of Object.entries(updates)) {
            const dbField = allowedFields[key];
            if (dbField && val !== undefined) {
                setClauses.push(`${dbField} = $${paramIdx}`);
                values.push(val);
                paramIdx++;
            }
        }

        // Set ready_at when transitioning to ready
        if (updates.status === 'ready') {
            setClauses.push(`ready_at = NOW()`);
        }

        if (setClauses.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'No valid fields to update' }) };
        }

        const { rows } = await pool.query(`
            UPDATE harvest_bins
            SET ${setClauses.join(', ')}
            WHERE id = $1 AND company_id = $2
            RETURNING *
        `, values);

        if (rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Bin not found' }) };
        }

        const b = rows[0];
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: b.id,
                harvestId: b.harvest_id,
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
            }),
        };
    } catch (error) {
        console.error('Error updating bin:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to update bin' }),
        };
    }
};
