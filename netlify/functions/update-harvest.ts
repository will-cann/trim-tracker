import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext, authorize } from './utils/auth';

const VALID_STATUSES = [
    'planning', 'active', 'submitted', 'drying', 'ready', 'completed',
    'cutting', 'hanging', 'bucking',
];

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const denied = authorize(context, 'technician');
        if (denied) return denied;

        const { harvestId, ...updates } = JSON.parse(event.body || '{}');

        if (!harvestId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'harvestId is required' }) };
        }

        // Validate field types before processing
        if (updates.plantCount !== undefined && (typeof updates.plantCount !== 'number' || updates.plantCount < 0)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'plantCount must be a non-negative number' }) };
        }
        if (updates.dryWeight !== undefined && (typeof updates.dryWeight !== 'number' || updates.dryWeight < 0)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'dryWeight must be a non-negative number' }) };
        }
        if (updates.moistureLossPct !== undefined && (typeof updates.moistureLossPct !== 'number' || updates.moistureLossPct < 0 || updates.moistureLossPct > 100)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'moistureLossPct must be between 0 and 100' }) };
        }
        if (updates.status !== undefined && !VALID_STATUSES.includes(updates.status)) {
            return { statusCode: 400, body: JSON.stringify({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }) };
        }

        // Allowlisted fields
        const allowedFields: Record<string, string> = {
            name: 'name',
            strain: 'strain',
            dryingLocation: 'drying_location',
            manicureLocation: 'manicure_location',
            plantCount: 'plant_count',
            isOnHold: 'is_on_hold',
            status: 'status',
            contaminants: 'contaminants',
            dryWeight: 'dry_weight',
            moistureLossPct: 'moisture_loss_pct',
        };

        const setClauses: string[] = [];
        const values: any[] = [harvestId, context.companyId];
        let paramIdx = 3;

        for (const [key, val] of Object.entries(updates)) {
            const dbField = allowedFields[key];
            if (dbField && val !== undefined) {
                setClauses.push(`${dbField} = $${paramIdx}`);
                values.push(val);
                paramIdx++;
            }
        }

        if (setClauses.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'No valid fields to update' }) };
        }

        const query = `
            UPDATE harvests
            SET ${setClauses.join(', ')}
            WHERE id = $1 AND company_id = $2
            RETURNING *
        `;

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Harvest not found' }) };
        }

        const h = result.rows[0];
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: h.id,
                batchId: h.batch_id,
                name: h.name,
                licenseNumber: h.license_number,
                strain: h.strain,
                plantCount: h.plant_count,
                totalWetWeight: parseFloat(h.total_wet_weight) || 0,
                totalWasteWeight: parseFloat(h.total_waste_weight) || 0,
                dryingLocation: h.drying_location,
                manicureLocation: h.manicure_location,
                status: h.status,
                isOnHold: h.is_on_hold,
                contaminants: h.contaminants || [],
                dryWeight: h.dry_weight ? parseFloat(h.dry_weight) : undefined,
                moistureLossPct: parseFloat(h.moisture_loss_pct) || 75,
                harvestStartDate: h.harvest_start_date,
                submittedAt: h.submitted_at,
                approvedAt: h.approved_at,
            }),
        };
    } catch (error) {
        console.error('Error updating harvest:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to update harvest' }),
        };
    }
};
