import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { captureError } from './utils/sentry';
import { resolveContext, authorize } from './utils/auth';
import { createHarvestBatchId } from './utils/harvest';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const denied = authorize(context, 'lead');
        if (denied) return denied;

        const data = JSON.parse(event.body || '{}');
        const {
            licenseNumber, strain, allocation, name,
            plantCount, dryingLocation, targetWeight, manicureLocation,
            plantIds, sourceBatchId, plannedHarvestDate,
        } = data;

        if (!strain || !allocation) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'strain and allocation are required' }),
            };
        }

        if (allocation === 'Both' && !targetWeight) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'targetWeight is required when allocation is Both' }),
            };
        }

        const batchId = name || createHarvestBatchId(licenseNumber || '', strain);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Check for duplicate batch ID within company
            const existing = await client.query(
                `SELECT id FROM harvests WHERE company_id = $1 AND batch_id = $2`,
                [context.companyId, batchId]
            );
            if (existing.rows.length > 0) {
                await client.query('ROLLBACK');
                return {
                    statusCode: 409,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'A harvest with this Batch ID already exists' }),
                };
            }

            // Determine plant count from plantIds if provided
            const resolvedPlantCount = (plantIds && plantIds.length > 0)
                ? plantIds.length
                : (plantCount || 0);

            const { rows: [harvest] } = await client.query(`
                INSERT INTO harvests (
                    company_id, created_by, batch_id, name, license_number, strain,
                    plant_count, drying_location, manicure_location, source_batch_id,
                    status, harvest_start_date
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'planning', $11)
                RETURNING *
            `, [
                context.companyId, context.userId, batchId, name || null,
                licenseNumber, strain, resolvedPlantCount,
                dryingLocation || null, manicureLocation || null,
                sourceBatchId || null,
                plannedHarvestDate || null,
            ]);

            // Link plants to this harvest plan (plants stay flowering until harvest day)
            let resolvedPlantIds = plantIds && plantIds.length > 0 ? plantIds : null;

            // Auto-resolve: if no plantIds provided but strain is known, find matching
            // unlinked flowering plants to enforce traceability
            if (!resolvedPlantIds) {
                const { rows: matchingPlants } = await client.query(`
                    SELECT id FROM plants
                    WHERE company_id = $1
                        AND LOWER(strain_name) = LOWER($2)
                        AND growth_phase = 'flowering'
                        AND harvest_id IS NULL
                    ORDER BY created_at ASC
                    ${plantCount ? `LIMIT ${parseInt(plantCount, 10)}` : ''}
                `, [context.companyId, strain]);

                if (matchingPlants.length > 0) {
                    resolvedPlantIds = matchingPlants.map((p: any) => p.id);

                    // Update plant count to match actual linked plants
                    await client.query(
                        `UPDATE harvests SET plant_count = $1 WHERE id = $2`,
                        [resolvedPlantIds.length, harvest.id]
                    );
                }
            }

            if (resolvedPlantIds && resolvedPlantIds.length > 0) {
                await client.query(`
                    UPDATE plants
                    SET harvest_id = $1
                    WHERE id = ANY($2::uuid[])
                        AND company_id = $3
                        AND growth_phase = 'flowering'
                `, [harvest.id, resolvedPlantIds, context.companyId]);
            }

            // Auto-capture strain
            if (strain) {
                await client.query(`
                    INSERT INTO strains (company_id, name)
                    VALUES ($1, $2)
                    ON CONFLICT (company_id, LOWER(name)) DO NOTHING
                `, [context.companyId, strain]);
            }

            await client.query('COMMIT');

            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: harvest.id,
                    batchId: harvest.batch_id,
                    name: harvest.name,
                    licenseNumber: harvest.license_number,
                    strain: harvest.strain,
                    plantCount: harvest.plant_count,
                    totalWetWeight: parseFloat(harvest.total_wet_weight) || 0,
                    totalWasteWeight: parseFloat(harvest.total_waste_weight) || 0,
                    dryingLocation: harvest.drying_location,
                    manicureLocation: harvest.manicure_location,
                    sourceBatchId: harvest.source_batch_id,
                    status: harvest.status,
                    isOnHold: harvest.is_on_hold,
                    contaminants: harvest.contaminants || [],
                    harvestStartDate: harvest.harvest_start_date,
                    allocations: [],
                    waste: [],
                    bins: [],
                    createdAt: harvest.created_at,
                }),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error creating harvest:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to create harvest' }),
        };
    }
};
