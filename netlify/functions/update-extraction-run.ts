import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { id, status, name, strain, notes } = JSON.parse(event.body || '{}');
        if (!id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'id is required' }) };
        }

        // Build dynamic SET clause
        const sets: string[] = ['updated_at = NOW()'];
        const values: any[] = [];
        let idx = 1;

        if (status !== undefined) {
            sets.push(`status = $${idx++}`);
            values.push(status);
            if (status === 'active') {
                sets.push(`started_at = COALESCE(started_at, NOW())`);
            } else if (status === 'completed' || status === 'cancelled') {
                sets.push(`completed_at = NOW()`);
            }
        }
        if (name !== undefined) { sets.push(`name = $${idx++}`); values.push(name.trim()); }
        if (strain !== undefined) { sets.push(`strain = $${idx++}`); values.push(strain?.trim() || null); }
        if (notes !== undefined) { sets.push(`notes = $${idx++}`); values.push(notes?.trim() || null); }

        values.push(id, context.companyId);

        const result = await pool.query(
            `UPDATE extraction_runs SET ${sets.join(', ')}
             WHERE id = $${idx++} AND company_id = $${idx}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Run not found' }) };
        }

        const r = result.rows[0];
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: r.id,
                status: r.status,
                name: r.name,
                strain: r.strain,
                notes: r.notes,
                startedAt: r.started_at,
                completedAt: r.completed_at,
                updatedAt: r.updated_at,
            }),
        };
    } catch (error) {
        console.error('Error updating extraction run:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update extraction run' }) };
    }
};
