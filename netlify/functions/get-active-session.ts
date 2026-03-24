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
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Unauthorized' })
            };
        }

        // Get active session
        const { rows: sessions } = await sql`
      SELECT * FROM trim_sessions 
      WHERE company_id = ${context.companyId} AND completed_at IS NULL
      LIMIT 1
    `;

        const session = sessions[0];

        if (!session) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(null),
            };
        }

        // Get entries for the session
        const { rows: entries } = await sql`
      SELECT * FROM trim_entries 
      WHERE session_id = ${session.id}
      ORDER BY created_at ASC
    `;

        // For each entry, get trimmers
        const fullEntries = await Promise.all(entries.map(async (entry) => {
            const { rows: trimmers } = await sql`
        SELECT * FROM trimmers 
        WHERE entry_id = ${entry.id}
        ORDER BY created_at ASC
      `;
            return {
                ...entry,
                harvestName: entry.harvest_name,
                licenseNumber: entry.license_number,
                startWeight: parseFloat(entry.start_weight) || 0,
                flowerWeight: parseFloat(entry.flower_weight) || 0,
                shakeWeight: parseFloat(entry.shake_weight) || 0,
                trimWeight: parseFloat(entry.trim_weight) || 0,
                wasteWeight: parseFloat(entry.waste_weight) || 0,
                plannedTrimDate: entry.planned_trim_date,
                plannedMethod: entry.planned_method,
                trimmers: trimmers.map(t => ({
                    ...t,
                    flowerWeight: parseFloat(t.flower_weight) || 0,
                    shakeWeight: parseFloat(t.shake_weight) || 0,
                    trimWeight: parseFloat(t.trim_weight) || 0,
                    wasteWeight: parseFloat(t.waste_weight) || 0,
                    startTime: t.start_time?.slice(0, 5),
                    endTime: t.end_time?.slice(0, 5),
                })),
            };
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...session,
                startTime: session.start_time,
                totalFlower: parseFloat(session.total_flower) || 0,
                totalShake: parseFloat(session.total_shake) || 0,
                totalTrim: parseFloat(session.total_trim) || 0,
                totalWaste: parseFloat(session.total_waste) || 0,
                entries: fullEntries,
            }),
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Error fetching active session:', msg, error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: msg }),
        };
    }
};
