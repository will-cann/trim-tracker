import { Handler } from '@netlify/functions';
import { resolveContext } from './utils/auth';
import { sql } from './utils/db';
import { withSentry } from './utils/sentry';

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers.authorization || '';
  const { companyId } = await resolveContext(authHeader);

  const id = event.queryStringParameters?.id;
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'id is required' }) };
  }

  const { rows } = await sql`
    DELETE FROM saved_reports
    WHERE id = ${id} AND company_id = ${companyId}
    RETURNING id
  `;

  if (rows.length === 0) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Report not found' }) };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deleted: true }),
  };
};

export { handler };
