import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { itemId, changeType, quantity, notes, referenceType, referenceId } = JSON.parse(event.body || '{}');

        if (!itemId || !changeType || quantity == null) {
            return { statusCode: 400, body: JSON.stringify({ error: 'itemId, changeType, and quantity are required' }) };
        }

        const validTypes = ['receive', 'consume', 'adjust', 'waste'];
        if (!validTypes.includes(changeType)) {
            return { statusCode: 400, body: JSON.stringify({ error: `changeType must be one of: ${validTypes.join(', ')}` }) };
        }

        // Calculate signed delta
        let delta: number;
        if (changeType === 'receive') {
            delta = Math.abs(quantity);
        } else if (changeType === 'consume' || changeType === 'waste') {
            delta = -Math.abs(quantity);
        } else {
            // adjust: quantity is the NEW absolute value — delta calculated after reading current
            delta = 0; // will be set below
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Fetch current item and lock the row
            const itemResult = await client.query(
                `SELECT id, quantity_on_hand, company_id FROM supply_items WHERE id = $1 FOR UPDATE`,
                [itemId]
            );

            if (itemResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return { statusCode: 404, body: JSON.stringify({ error: 'Item not found' }) };
            }
            if (itemResult.rows[0].company_id !== context.companyId) {
                await client.query('ROLLBACK');
                return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
            }

            const currentQty = Number(itemResult.rows[0].quantity_on_hand);

            // For adjust, delta is difference between new value and current
            if (changeType === 'adjust') {
                delta = quantity - currentQty;
            }

            const newQty = currentQty + delta;

            // Update item quantity
            await client.query(
                `UPDATE supply_items SET quantity_on_hand = $1 WHERE id = $2`,
                [newQty, itemId]
            );

            // Insert ledger entry
            const ledgerResult = await client.query(
                `INSERT INTO supply_ledger (
                    company_id, supply_item_id, change_type, quantity_delta, quantity_after,
                    reference_type, reference_id, notes, performed_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *`,
                [
                    context.companyId, itemId, changeType, delta, newQty,
                    referenceType || null, referenceId || null,
                    notes || null, context.userId,
                ]
            );

            await client.query('COMMIT');

            // Fetch updated item with pool info
            const updatedResult = await client.query(
                `SELECT si.*, sp.slug as pool_slug, sp.label as pool_label
                 FROM supply_items si
                 JOIN supply_pools sp ON si.pool_id = sp.id
                 WHERE si.id = $1`,
                [itemId]
            );
            const row = updatedResult.rows[0];
            const entry = ledgerResult.rows[0];

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item: {
                        id: row.id,
                        poolId: row.pool_id,
                        poolSlug: row.pool_slug,
                        poolLabel: row.pool_label,
                        name: row.name,
                        description: row.description || undefined,
                        category: row.category || undefined,
                        unit: row.unit,
                        quantityOnHand: Number(row.quantity_on_hand),
                        parLevel: row.par_level != null ? Number(row.par_level) : undefined,
                        reorderQty: row.reorder_qty != null ? Number(row.reorder_qty) : undefined,
                        vendorName: row.vendor_name || undefined,
                        sku: row.sku || undefined,
                        unitCost: row.unit_cost != null ? Number(row.unit_cost) : undefined,
                        isActive: row.is_active,
                        createdAt: row.created_at,
                        updatedAt: row.updated_at,
                    },
                    entry: {
                        id: entry.id,
                        supplyItemId: entry.supply_item_id,
                        changeType: entry.change_type,
                        quantityDelta: Number(entry.quantity_delta),
                        quantityAfter: Number(entry.quantity_after),
                        referenceType: entry.reference_type || undefined,
                        referenceId: entry.reference_id || undefined,
                        notes: entry.notes || undefined,
                        performedBy: entry.performed_by || undefined,
                        createdAt: entry.created_at,
                    },
                }),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error creating supply ledger entry:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to create supply ledger entry' }),
        };
    }
};
