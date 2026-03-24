import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'PUT') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);

        if (!context) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Unauthorized' })
            };
        }

        const { entryId, status } = JSON.parse(event.body || '{}');

        if (!entryId || !status) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Entry ID and Status are required' }),
            };
        }

        // Validate before allowing submission
        if (status === 'submitted') {
            const { rows: trimmers } = await sql`
                SELECT id, profile_id, start_time, end_time FROM trimmers
                WHERE entry_id = ${entryId}
            `;

            if (trimmers.length === 0) {
                return {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'Cannot submit: batch has no trimmers.' }),
                };
            }

            const incomplete = trimmers.find(t => !t.profile_id || !t.start_time || !t.end_time);
            if (incomplete) {
                return {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'Cannot submit: all trimmers must have a profile, start time, and end time.' }),
                };
            }
        }

        await sql`
      UPDATE trim_entries
      SET status = ${status}
      WHERE id = ${entryId} AND session_id IN (
        SELECT id FROM trim_sessions WHERE company_id = ${context.companyId}
      )
    `;

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true }),
        };
    } catch (error) {
        console.error('Error updating entry status:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to update entry status' }),
        };
    }
};
