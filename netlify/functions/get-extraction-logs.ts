import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const params = event.queryStringParameters || {};
        const extractionType = params.type;
        const strain = params.strain;
        const limit = Math.min(parseInt(params.limit || '200', 10), 500);

        let result;

        if (extractionType && strain) {
            result = await sql`
                SELECT e.*,
                       sp.label AS source_label,
                       op.label AS output_label
                FROM extraction_logs e
                LEFT JOIN packages sp ON sp.id = e.source_package_id
                LEFT JOIN packages op ON op.id = e.output_package_id
                WHERE e.company_id = ${context.companyId}
                  AND e.extraction_type = ${extractionType}
                  AND e.strain = ${strain}
                ORDER BY e.created_at DESC
                LIMIT ${limit}
            `;
        } else if (extractionType) {
            result = await sql`
                SELECT e.*,
                       sp.label AS source_label,
                       op.label AS output_label
                FROM extraction_logs e
                LEFT JOIN packages sp ON sp.id = e.source_package_id
                LEFT JOIN packages op ON op.id = e.output_package_id
                WHERE e.company_id = ${context.companyId}
                  AND e.extraction_type = ${extractionType}
                ORDER BY e.created_at DESC
                LIMIT ${limit}
            `;
        } else if (strain) {
            result = await sql`
                SELECT e.*,
                       sp.label AS source_label,
                       op.label AS output_label
                FROM extraction_logs e
                LEFT JOIN packages sp ON sp.id = e.source_package_id
                LEFT JOIN packages op ON op.id = e.output_package_id
                WHERE e.company_id = ${context.companyId}
                  AND e.strain = ${strain}
                ORDER BY e.created_at DESC
                LIMIT ${limit}
            `;
        } else {
            result = await sql`
                SELECT e.*,
                       sp.label AS source_label,
                       op.label AS output_label
                FROM extraction_logs e
                LEFT JOIN packages sp ON sp.id = e.source_package_id
                LEFT JOIN packages op ON op.id = e.output_package_id
                WHERE e.company_id = ${context.companyId}
                ORDER BY e.created_at DESC
                LIMIT ${limit}
            `;
        }

        const logs = result.rows.map((row: any) => formatLog(row));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logs),
        };
    } catch (error) {
        console.error('Error fetching extraction logs:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch extraction logs' }),
        };
    }
};

function formatLog(row: any) {
    return {
        id: row.id,
        sourcePackageId: row.source_package_id,
        sourceLabel: row.source_label || null,
        inputPackageType: row.input_package_type,
        inputQuantity: row.input_quantity ? parseFloat(row.input_quantity) : null,
        outputPackageId: row.output_package_id,
        outputLabel: row.output_label || null,
        outputPackageType: row.output_package_type,
        outputQuantity: row.output_quantity ? parseFloat(row.output_quantity) : null,
        strain: row.strain,
        licenseNumber: row.license_number,
        extractionType: row.extraction_type,
        yieldPercentage: row.yield_percentage ? parseFloat(row.yield_percentage) : null,
        wasteWeight: row.waste_weight ? parseFloat(row.waste_weight) : 0,
        notes: row.notes,
        createdAt: row.created_at,
    };
}
