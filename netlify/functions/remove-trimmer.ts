import { Handler } from '@netlify/functions';
import { sql, pool } from './utils/db';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { trimmerId, entryId } = event.queryStringParameters || {};

  if (!trimmerId || !entryId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Trimmer ID and Entry ID are required' }),
    };
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Remove trimmer
      await client.query('DELETE FROM trimmers WHERE id = $1', [trimmerId]);

      // Recalculate entry weights
      const entryWeightsResult = await client.query(`
        SELECT 
          COALESCE(SUM(flower_weight), 0) as flower_weight,
          COALESCE(SUM(shake_weight), 0) as shake_weight,
          COALESCE(SUM(trim_weight), 0) as trim_weight,
          COALESCE(SUM(waste_weight), 0) as waste_weight
        FROM trimmers
        WHERE entry_id = $1
      `, [entryId]);

      const newEntryWeights = entryWeightsResult.rows[0];

      await client.query(`
        UPDATE trim_entries
        SET 
          flower_weight = $1,
          shake_weight = $2,
          trim_weight = $3,
          waste_weight = $4
        WHERE id = $5
      `, [newEntryWeights.flower_weight, newEntryWeights.shake_weight, newEntryWeights.trim_weight, newEntryWeights.waste_weight, entryId]);

      // Update session totals
      const entryResult = await client.query('SELECT session_id FROM trim_entries WHERE id = $1', [entryId]);
      const entry = entryResult.rows[0];

      if (entry) {
        const sessionTotalsResult = await client.query(`
          SELECT 
            COALESCE(SUM(flower_weight), 0) as flower_weight,
            COALESCE(SUM(shake_weight), 0) as shake_weight,
            COALESCE(SUM(trim_weight), 0) as trim_weight,
            COALESCE(SUM(waste_weight), 0) as waste_weight
          FROM trim_entries
          WHERE session_id = $1
        `, [entry.session_id]);

        const newSessionTotals = sessionTotalsResult.rows[0];

        await client.query(`
          UPDATE trim_sessions
          SET 
            total_flower = $1,
            total_shake = $2,
            total_trim = $3,
            total_waste = $4
          WHERE id = $5
        `, [newSessionTotals.flower_weight, newSessionTotals.shake_weight, newSessionTotals.trim_weight, newSessionTotals.waste_weight, entry.session_id]);
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return {
      statusCode: 204,
      body: '',
    };
  } catch (error) {
    console.error('Error removing trimmer:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to remove trimmer' }),
    };
  }
};
