import { Pool } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Simple SQL tag for pool.query with support for $1, $2, etc.
 * Usage: sql`SELECT * FROM users WHERE id = ${id}`
 */
export async function sql(strings: TemplateStringsArray, ...values: any[]) {
  const query = strings.reduce((acc, str, i) => acc + str + (i < values.length ? `$${i + 1}` : ''), '');
  return pool.query(query, values);
}
