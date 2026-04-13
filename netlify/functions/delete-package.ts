import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext, authorize } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'DELETE') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const denied = authorize(context, 'director');
        if (denied) return denied;

        const id = event.queryStringParameters?.id;
        if (!id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'id is required' }) };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get the package to check ownership and find tag
            const { rows: [pkg] } = await client.query(
                `SELECT id, tag_id FROM packages WHERE id = $1 AND company_id = $2`,
                [id, context.companyId]
            );

            if (!pkg) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Package not found' }) };
            }

            // Unassign tag if one was assigned
            if (pkg.tag_id) {
                await client.query(`
                    UPDATE tags SET status = 'available', assigned_at = NULL
                    WHERE id = $1 AND company_id = $2
                `, [pkg.tag_id, context.companyId]);
            }

            await client.query(`DELETE FROM packages WHERE id = $1 AND company_id = $2`, [id, context.companyId]);

            await client.query('COMMIT');

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true }),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error deleting package:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to delete package' }),
        };
    }
};
