import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext, authorize } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const denied = authorize(context, 'manager');
        if (denied) return denied;

        const body = JSON.parse(event.body || '{}');

        const useTags = body.useTags ?? false;
        const tagSource = ['auto', 'upload'].includes(body.tagSource) ? body.tagSource : 'auto';
        const tagOnPhase = ['nursery_to_veg', 'veg_to_flower'].includes(body.tagOnPhase) ? body.tagOnPhase : 'nursery_to_veg';
        const requireBatchTag = body.requireBatchTag ?? false;
        const autoTagPrefix = (body.autoTagPrefix || 'PLT').slice(0, 20);

        const result = await sql`
            INSERT INTO tag_settings (company_id, use_tags, tag_source, tag_on_phase, require_batch_tag, auto_tag_prefix)
            VALUES (${context.companyId}, ${useTags}, ${tagSource}, ${tagOnPhase}, ${requireBatchTag}, ${autoTagPrefix})
            ON CONFLICT (company_id) DO UPDATE SET
                use_tags = ${useTags},
                tag_source = ${tagSource},
                tag_on_phase = ${tagOnPhase},
                require_batch_tag = ${requireBatchTag},
                auto_tag_prefix = ${autoTagPrefix}
            RETURNING *
        `;

        const row = result.rows[0];
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                useTags: row.use_tags,
                tagSource: row.tag_source,
                tagOnPhase: row.tag_on_phase,
                requireBatchTag: row.require_batch_tag,
                autoTagPrefix: row.auto_tag_prefix,
                autoTagCounter: row.auto_tag_counter,
            }),
        };
    } catch (error) {
        console.error('Error updating tag settings:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update tag settings' }) };
    }
};
