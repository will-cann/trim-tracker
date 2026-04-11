import { neon, Pool } from '@neondatabase/serverless';

// Netlify's Neon integration injects NETLIFY_DATABASE_URL; local .env uses DATABASE_URL.
const connectionString = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error('No database connection string set (NETLIFY_DATABASE_URL or DATABASE_URL)');
}

// HTTP-based query function (recommended for serverless)
const neonSql = connectionString ? neon(connectionString) : null;

// Lazy pool for transaction support (create-session, update-trimmer, etc.)
let _pool: Pool | null = null;
export const pool = new Proxy({} as Pool, {
  get(_, prop) {
    if (!_pool) {
      _pool = new Pool({ connectionString });
    }
    const val = (_pool as any)[prop];
    return typeof val === 'function' ? val.bind(_pool) : val;
  }
});

/**
 * SQL tagged template using Neon's HTTP driver (no WebSocket).
 * Usage: sql`SELECT * FROM users WHERE id = ${id}`
 * Returns { rows: [...] } to match pool.query() shape.
 */
export async function sql(strings: TemplateStringsArray, ...values: any[]) {
  if (!neonSql) throw new Error('No database connection string set (NETLIFY_DATABASE_URL or DATABASE_URL)');
  const rows = await neonSql(strings, ...values);
  return { rows };
}
