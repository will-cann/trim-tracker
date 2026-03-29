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

        const result = await sql`
            SELECT * FROM tag_settings WHERE company_id = ${context.companyId}
        `;

        // Return defaults if no settings row exists
        const row = result.rows[0];
        const settings = row ? {
            useTags: row.use_tags,
            tagSource: row.tag_source,
            tagOnPhase: row.tag_on_phase,
            requireBatchTag: row.require_batch_tag,
            autoTagPrefix: row.auto_tag_prefix,
            autoTagCounter: row.auto_tag_counter,
        } : {
            useTags: false,
            tagSource: 'auto',
            tagOnPhase: 'nursery_to_veg',
            requireBatchTag: false,
            autoTagPrefix: 'PLT',
            autoTagCounter: 0,
        };

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
        };
    } catch (error) {
        console.error('Error getting tag settings:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to get tag settings' }) };
    }
};
