import { neon, neonConfig, Pool } from '@neondatabase/serverless';

// Use fetch-based connections (no WebSocket needed)
neonConfig.fetchConnectionCache = true;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
}

// HTTP-based query function (recommended for serverless)
const neonSql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

// Lazy pool for transaction support (create-session, update-trimmer, etc.)
let _pool: Pool | null = null;
export const pool = new Proxy({} as Pool, {
  get(_, prop) {
    if (!_pool) {
      _pool = new Pool({ connectionString: process.env.DATABASE_URL });
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
  if (!neonSql) throw new Error('DATABASE_URL is not set');
  const rows = await neonSql(strings, ...values);
  return { rows };
}
