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
                    startWeight: parseFloat(entry.start_weight) || 0,
                    flowerWeight: parseFloat(entry.flower_weight) || 0,
                    shakeWeight: parseFloat(entry.shake_weight) || 0,
                    trimWeight: parseFloat(entry.trim_weight) || 0,
                    wasteWeight: parseFloat(entry.waste_weight) || 0,
                    trimmers: trimmers.map(t => ({
                        ...t,
                        profileId: t.profile_id,
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
                ...session,
                startTime: session.start_time,
                endTime: session.end_time,
                completedAt: session.completed_at,
                totalFlower: parseFloat(session.total_flower) || 0,
                totalShake: parseFloat(session.total_shake) || 0,
                totalTrim: parseFloat(session.total_trim) || 0,
                totalWaste: parseFloat(session.total_waste) || 0,
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
