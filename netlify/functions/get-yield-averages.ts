import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * GET /get-yield-averages
 *
 * Aggregates extraction_logs to return average yield percentages grouped by
 * (strain, input_package_type, output_package_type). Powers the demand-backward
 * planning engine — "fresh_frozen → bubble_hash for Toadstool yields 3.5% avg."
 *
 * Query params (all optional):
 *   strain        — filter to a specific strain
 *   inputType     — filter by input_package_type
 *   outputType    — filter by output_package_type
 *   since         — ISO date string, only include logs after this date
 */
export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { strain, inputType, outputType, since } = event.queryStringParameters || {};

        // Build WHERE conditions
        const conditions = ['company_id = ${companyId}', 'yield_percentage IS NOT NULL'];
        const params: Record<string, string> = { companyId: context.companyId };

        if (strain) {
            conditions.push('strain = ${strain}');
            params.strain = strain;
        }
        if (inputType) {
            conditions.push('input_package_type = ${inputType}');
            params.inputType = inputType;
        }
        if (outputType) {
            conditions.push('output_package_type = ${outputType}');
            params.outputType = outputType;
        }
        if (since) {
            conditions.push('created_at >= ${since}::timestamptz');
            params.since = since;
        }

        // Use parameterized query with sql tagged template
        const result = await sql`
            SELECT
                strain,
                input_package_type AS input_type,
                output_package_type AS output_type,
                ROUND(AVG(yield_percentage)::numeric, 2) AS avg_yield_pct,
                ROUND(MIN(yield_percentage)::numeric, 2) AS min_yield_pct,
                ROUND(MAX(yield_percentage)::numeric, 2) AS max_yield_pct,
                COUNT(*)::int AS sample_count,
                MAX(created_at) AS last_run_date
            FROM extraction_logs
            WHERE company_id = ${context.companyId}
              AND yield_percentage IS NOT NULL
              ${strain ? sql`AND strain = ${strain}` : sql``}
              ${inputType ? sql`AND input_package_type = ${inputType}` : sql``}
              ${outputType ? sql`AND output_package_type = ${outputType}` : sql``}
              ${since ? sql`AND created_at >= ${since}::timestamptz` : sql``}
            GROUP BY strain, input_package_type, output_package_type
            ORDER BY sample_count DESC, strain ASC
        `;

        const averages = result.rows.map((row: any) => ({
            strain: row.strain,
            inputType: row.input_type,
            outputType: row.output_type,
            avgYieldPct: parseFloat(row.avg_yield_pct),
            minYieldPct: parseFloat(row.min_yield_pct),
            maxYieldPct: parseFloat(row.max_yield_pct),
            sampleCount: row.sample_count,
            lastRunDate: row.last_run_date,
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(averages),
        };
    } catch (error) {
        console.error('Error fetching yield averages:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch yield averages' }) };
    }
};
