import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext, authorize } from './utils/auth';

const VALID_REASONS = ['Waste', 'Moisture Loss', 'Processing Loss', 'Theft', 'Reconciliation'];

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const denied = authorize(context, 'technician');
        if (denied) return denied;

        const { packageId, quantityDelta, reason, notes } = JSON.parse(event.body || '{}');

        if (!packageId || quantityDelta === undefined || !reason) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'packageId, quantityDelta, and reason are required' }),
            };
        }

        if (typeof quantityDelta !== 'number' || quantityDelta === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'quantityDelta must be a non-zero number' }),
            };
        }

        if (!VALID_REASONS.includes(reason)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: `reason must be one of: ${VALID_REASONS.join(', ')}` }),
            };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Lock and fetch current quantity
            const { rows: [pkg] } = await client.query(
                `SELECT id, quantity, status FROM packages WHERE id = $1 AND company_id = $2 FOR UPDATE`,
                [packageId, context.companyId]
            );

            if (!pkg) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Package not found' }) };
            }

            if (pkg.status === 'finished' || pkg.status === 'archived') {
                await client.query('ROLLBACK');
                return { statusCode: 400, body: JSON.stringify({ error: 'Cannot adjust a finished or archived package' }) };
            }

            const quantityBefore = parseFloat(pkg.quantity);
            const quantityAfter = quantityBefore + quantityDelta;

            if (quantityAfter < 0) {
                await client.query('ROLLBACK');
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: `Adjustment would result in negative quantity (${quantityBefore} + ${quantityDelta} = ${quantityAfter})` }),
                };
            }

            // Update package quantity
            await client.query(
                `UPDATE packages SET quantity = $1 WHERE id = $2 AND company_id = $3`,
                [quantityAfter, packageId, context.companyId]
            );

            // Insert adjustment record
            const { rows: [adj] } = await client.query(`
                INSERT INTO package_adjustments (
                    company_id, package_id, created_by,
                    quantity_before, quantity_after, quantity_delta,
                    reason, notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
            `, [
                context.companyId,
                packageId,
                context.userId,
                quantityBefore,
                quantityAfter,
                quantityDelta,
                reason,
                notes || null,
            ]);

            await client.query('COMMIT');

            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    adjustment: {
                        id: adj.id,
                        packageId: adj.package_id,
                        quantityBefore: parseFloat(adj.quantity_before),
                        quantityAfter: parseFloat(adj.quantity_after),
                        quantityDelta: parseFloat(adj.quantity_delta),
                        reason: adj.reason,
                        notes: adj.notes,
                        createdBy: adj.created_by,
                        createdAt: adj.created_at,
                    },
                    newQuantity: quantityAfter,
                }),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error creating package adjustment:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to create adjustment' }),
        };
    }
};
