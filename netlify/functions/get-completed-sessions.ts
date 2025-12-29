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

        const { rows: sessions } = await sql`
      SELECT * FROM trim_sessions 
      WHERE company_id = ${context.companyId} AND completed_at IS NOT NULL
      ORDER BY completed_at DESC
    `;

        // Fetch entries and trimmers for each session for reports
        const fullSessions = await Promise.all(sessions.map(async (session) => {
            const { rows: entries } = await sql`
            SELECT * FROM trim_entries 
            WHERE session_id = ${session.id}
            ORDER BY created_at ASC
        `;

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
                    startWeight: parseFloat(entry.start_weight),
                    flowerWeight: parseFloat(entry.flower_weight),
                    shakeWeight: parseFloat(entry.shake_weight),
                    trimWeight: parseFloat(entry.trim_weight),
                    wasteWeight: parseFloat(entry.waste_weight),
                    trimmers: trimmers.map(t => ({
                        ...t,
                        flowerWeight: parseFloat(t.flower_weight),
                        shakeWeight: parseFloat(t.shake_weight),
                        trimWeight: parseFloat(t.trim_weight),
                        wasteWeight: parseFloat(t.waste_weight),
                        startTime: t.start_time,
                        endTime: t.end_time,
                    })),
                };
            }));

            return {
                ...session,
                startTime: session.start_time,
                endTime: session.end_time,
                completedAt: session.completed_at,
                totalFlower: parseFloat(session.total_flower),
                totalShake: parseFloat(session.total_shake),
                totalTrim: parseFloat(session.total_trim),
                totalWaste: parseFloat(session.total_waste),
                entries: fullEntries,
            };
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullSessions),
        };
    } catch (error) {
        console.error('Error fetching completed sessions:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch completed sessions' }),
        };
    }
};
