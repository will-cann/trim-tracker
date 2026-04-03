import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'DELETE') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { id } = JSON.parse(event.body || '{}');
        if (!id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'id is required' }) };
        }

        // Soft-delete by deactivating (steps remain for historical runs)
        const result = await sql`
            UPDATE process_templates
            SET is_active = false, updated_at = NOW()
            WHERE id = ${id} AND company_id = ${context.companyId}
            RETURNING id
        `;

        if (result.rows.length === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Template not found' }) };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true }),
        };
    } catch (error) {
        console.error('Error deleting process template:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to delete process template' }) };
    }
};
