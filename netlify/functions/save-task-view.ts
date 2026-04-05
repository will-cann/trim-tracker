import { Handler } from '@netlify/functions';
import { resolveContext } from './utils/auth';
import { sql } from './utils/db';

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers.authorization || '';
  const { userId, companyId } = await resolveContext(authHeader);

  let body: { id?: string; title: string; spec: any; pinned?: boolean };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!body.title || !body.spec) {
    return { statusCode: 400, body: JSON.stringify({ error: 'title and spec are required' }) };
  }

  const format = (r: any) => ({
    id: r.id,
    title: r.title,
    spec: r.spec,
    pinned: r.pinned,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });

  // Update existing view
  if (body.id) {
    const { rows } = await sql`
      UPDATE saved_task_views
      SET title = ${body.title},
          spec = ${JSON.stringify(body.spec)},
          pinned = ${body.pinned ?? false}
      WHERE id = ${body.id} AND company_id = ${companyId} AND created_by = ${userId}
      RETURNING id, title, spec, pinned, created_at, updated_at
    `;
    if (rows.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'View not found' }) };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(format(rows[0])),
    };
  }

  // Create new view
  const { rows } = await sql`
    INSERT INTO saved_task_views (company_id, created_by, title, spec, pinned)
    VALUES (${companyId}, ${userId}, ${body.title}, ${JSON.stringify(body.spec)}, ${body.pinned ?? false})
    RETURNING id, title, spec, pinned, created_at, updated_at
  `;

  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(format(rows[0])),
  };
};

export { handler };
