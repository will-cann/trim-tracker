import { Handler } from '@netlify/functions';
import { resolveContext } from './utils/auth';
import { buildRoomLayout } from './utils/plantMap';

/**
 * GET /get-room-layout?roomId=…
 *
 * Everything the map view needs for one room: the grid, every live plant
 * with its cell and strain traits, the health-event history for the room,
 * the hot-spot surface computed from that history, and the move planner's
 * suggestions (which may point at empty cells in sibling rooms).
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const roomId = event.queryStringParameters?.roomId;
        if (!roomId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing roomId parameter.' }) };
        }

        const layout = await buildRoomLayout(context.companyId, roomId);
        if (!layout) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Room not found.' }) };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(layout),
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Error fetching room layout:', msg);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch room layout', detail: msg }),
        };
    }
};
