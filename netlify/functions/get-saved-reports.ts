import { Handler } from '@netlify/functions';
import { resolveContext } from './utils/auth';
import { sql } from './utils/db';
import { withSentry } from './utils/sentry';

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers.authorization || '';
  const { companyId } = await resolveContext(authHeader);

  const { rows } = await sql`
    SELECT id, title, description, spec, pinned, created_at, updated_at
    FROM saved_reports
    WHERE company_id = ${companyId}
    ORDER BY pinned DESC, updated_at DESC
  `;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rows),
  };
};

export { handler };
