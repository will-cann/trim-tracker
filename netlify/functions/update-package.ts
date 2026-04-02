import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext, authorize } from './utils/auth';

const VALID_STATUSES = ['active', 'on_hold', 'finished', 'archived'];
const VALID_LAB_STATES = ['not_submitted', 'submitted', 'passed', 'failed'];

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

        const data = JSON.parse(event.body || '{}');
        const { packageId, ...updates } = data;

        if (!packageId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'packageId is required' }) };
        }

        // Validate field types
        if (updates.status !== undefined && !VALID_STATUSES.includes(updates.status)) {
            return { statusCode: 400, body: JSON.stringify({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }) };
        }
        if (updates.labTestingState !== undefined && !VALID_LAB_STATES.includes(updates.labTestingState)) {
            return { statusCode: 400, body: JSON.stringify({ error: `labTestingState must be one of: ${VALID_LAB_STATES.join(', ')}` }) };
        }
        if (updates.quantity !== undefined && (typeof updates.quantity !== 'number' || updates.quantity < 0)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'quantity must be a non-negative number' }) };
        }
        if (updates.wasteWeight !== undefined && (typeof updates.wasteWeight !== 'number' || updates.wasteWeight < 0)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'wasteWeight must be a non-negative number' }) };
        }

        const allowedFields: Record<string, string> = {
            status: 'status',
            location: 'location',
            notes: 'notes',
            labTestingState: 'lab_testing_state',
            itemName: 'item_name',
            quantity: 'quantity',
            wasteWeight: 'waste_weight',
        };

        const setClauses: string[] = [];
        const values: any[] = [packageId, context.companyId];
        let paramIdx = 3;

        for (const [key, val] of Object.entries(updates)) {
            const dbField = allowedFields[key];
            if (dbField && val !== undefined) {
                setClauses.push(`${dbField} = $${paramIdx}`);
                values.push(val);
                paramIdx++;
            }
        }

        // Auto-set finished_date when status changes to finished
        if (updates.status === 'finished') {
            setClauses.push(`finished_date = NOW()`);
        } else if (updates.status === 'active' || updates.status === 'on_hold') {
            setClauses.push(`finished_date = NULL`);
        }

        if (setClauses.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'No valid fields to update' }) };
        }

        const query = `
            UPDATE packages
            SET ${setClauses.join(', ')}
            WHERE id = $1 AND company_id = $2
            RETURNING *
        `;

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Package not found' }) };
        }

        const row = result.rows[0];
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: row.id,
                harvestId: row.harvest_id,
                trimEntryId: row.trim_entry_id,
                tagId: row.tag_id,
                label: row.label,
                packageType: row.package_type,
                itemName: row.item_name,
                strain: row.strain,
                licenseNumber: row.license_number,
                quantity: parseFloat(row.quantity) || 0,
                unit: row.unit,
                wasteWeight: parseFloat(row.waste_weight) || 0,
                location: row.location,
                notes: row.notes,
                status: row.status,
                labTestingState: row.lab_testing_state,
                packagedDate: row.packaged_date,
                finishedDate: row.finished_date,
                createdAt: row.created_at,
            }),
        };
    } catch (error) {
        console.error('Error updating package:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to update package' }),
        };
    }
};
