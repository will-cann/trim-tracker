import { Handler } from '@netlify/functions';
import { resolveContext } from './utils/auth';
import { sql } from './utils/db';
import { withSentry } from './utils/sentry';

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers.authorization || '';
  const { userId, companyId } = await resolveContext(authHeader);

  let body: { title: string; description?: string; spec: any; id?: string; pinned?: boolean };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!body.title || !body.spec) {
    return { statusCode: 400, body: JSON.stringify({ error: 'title and spec are required' }) };
  }

  // Update existing report
  if (body.id) {
    const { rows } = await sql`
      UPDATE saved_reports
      SET title = ${body.title},
          description = ${body.description || null},
          spec = ${JSON.stringify(body.spec)},
          pinned = ${body.pinned ?? false}
      WHERE id = ${body.id} AND company_id = ${companyId}
      RETURNING id, title, description, spec, pinned, created_at, updated_at
    `;
    if (rows.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Report not found' }) };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows[0]),
    };
  }

  // Create new report
  const { rows } = await sql`
    INSERT INTO saved_reports (company_id, created_by, title, description, spec, pinned)
    VALUES (${companyId}, ${userId}, ${body.title}, ${body.description || null}, ${JSON.stringify(body.spec)}, ${body.pinned ?? false})
    RETURNING id, title, description, spec, pinned, created_at, updated_at
  `;

  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rows[0]),
  };
};

export { handler };
