import { Handler } from '@netlify/functions';
import { resolveContext } from './utils/auth';
import { sql } from './utils/db';

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers.authorization || '';
  const { userId, companyId } = await resolveContext(authHeader);

  const { rows } = await sql`
    SELECT id, title, spec, pinned, created_at, updated_at
    FROM saved_task_views
    WHERE company_id = ${companyId} AND created_by = ${userId}
    ORDER BY pinned DESC, updated_at DESC
  `;

  const views = rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    spec: r.spec,
    pinned: r.pinned,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(views),
  };
};

export { handler };
