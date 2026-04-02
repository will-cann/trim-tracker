import { sql } from './db';

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds?: number;
}

/**
 * Sliding-window rate limiter backed by a DB table.
 * Counts requests per (company, endpoint) in the given window.
 *
 * Uses an upsert pattern — the table auto-creates rows as needed.
 */
export async function checkRateLimit(
    companyId: string,
    endpoint: string,
    maxRequests: number,
    windowSeconds: number,
): Promise<RateLimitResult> {
    // Atomic: increment counter, reset if window has elapsed
    const { rows } = await sql`
        INSERT INTO rate_limits (company_id, endpoint, request_count, window_start)
        VALUES (${companyId}, ${endpoint}, 1, NOW())
        ON CONFLICT (company_id, endpoint) DO UPDATE SET
            request_count = CASE
                WHEN rate_limits.window_start + (${windowSeconds} || ' seconds')::interval < NOW()
                THEN 1
                ELSE rate_limits.request_count + 1
            END,
            window_start = CASE
                WHEN rate_limits.window_start + (${windowSeconds} || ' seconds')::interval < NOW()
                THEN NOW()
                ELSE rate_limits.window_start
            END
        RETURNING request_count, window_start
    `;

    const count = rows[0].request_count;
    const windowStart = new Date(rows[0].window_start);
    const windowEnd = new Date(windowStart.getTime() + windowSeconds * 1000);
    const remaining = Math.max(0, maxRequests - count);

    if (count > maxRequests) {
        const retryAfterSeconds = Math.ceil((windowEnd.getTime() - Date.now()) / 1000);
        return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    return { allowed: true, remaining };
}
