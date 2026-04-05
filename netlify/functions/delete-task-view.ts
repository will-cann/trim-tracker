import { Handler } from '@netlify/functions';
import { resolveContext } from './utils/auth';
import { sql } from './utils/db';

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers.authorization || '';
  const { userId, companyId } = await resolveContext(authHeader);

  const id = event.queryStringParameters?.id;
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'id is required' }) };
  }

  const { rows } = await sql`
    DELETE FROM saved_task_views
    WHERE id = ${id} AND company_id = ${companyId} AND created_by = ${userId}
    RETURNING id
  `;

  if (rows.length === 0) {
    return { statusCode: 404, body: JSON.stringify({ error: 'View not found' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deleted: true }),
  };
};

export { handler };
