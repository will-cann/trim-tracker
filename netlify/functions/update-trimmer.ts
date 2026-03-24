import { Handler } from '@netlify/functions';
import { sql, pool } from './utils/db';
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

    const { trimmerId, entryId, updates } = JSON.parse(event.body || '{}');

    if (!trimmerId || !entryId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Trimmer ID and Entry ID are required' }),
      };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify ownership
      const ownershipResult = await client.query(`
        SELECT ts.company_id 
        FROM trim_sessions ts
        JOIN trim_entries te ON te.session_id = ts.id
        WHERE te.id = $1
      `, [entryId]);

      if (ownershipResult.rows.length === 0 || ownershipResult.rows[0].company_id !== context.companyId) {
        throw new Error('Forbidden: You do not have access to this resource');
      }

      // Update trimmer - build SET clause dynamically for provided fields
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      const fieldMap: Record<string, string> = {
        name: 'name',
        profileId: 'profile_id',
        startTime: 'start_time',
        endTime: 'end_time',
        flowerWeight: 'flower_weight',
        shakeWeight: 'shake_weight',
        trimWeight: 'trim_weight',
        wasteWeight: 'waste_weight',
        tool: 'tool',
      };

      for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
        if (updates[jsKey] !== undefined) {
          setClauses.push(`${dbCol} = $${paramIdx}`);
          values.push(updates[jsKey]);
          paramIdx++;
        }
      }

      if (setClauses.length > 0) {
        values.push(trimmerId);
        await client.query(
          `UPDATE trimmers SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
          values
        );
      }

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
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error('Error updating trimmer:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to update trimmer' }),
    };
  }
};
