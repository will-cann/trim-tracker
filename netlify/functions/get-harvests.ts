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

        const statusFilter = event.queryStringParameters?.status;

        let harvests;
        if (statusFilter) {
            const result = await sql`
                SELECT * FROM harvests
                WHERE company_id = ${context.companyId} AND status = ${statusFilter}
                ORDER BY created_at DESC
            `;
            harvests = result.rows;
        } else {
            const result = await sql`
                SELECT * FROM harvests
                WHERE company_id = ${context.companyId}
                ORDER BY created_at DESC
            `;
            harvests = result.rows;
        }

        // Fetch allocations and waste for all harvests
        const harvestIds = harvests.map((h: any) => h.id);

        let allAllocations: any[] = [];
        let allWaste: any[] = [];
        let allBins: any[] = [];

        if (harvestIds.length > 0) {
            const allocResult = await sql`
                SELECT * FROM harvest_allocations
                WHERE harvest_id = ANY(${harvestIds})
                ORDER BY created_at ASC
            `;
            allAllocations = allocResult.rows;

            const wasteResult = await sql`
                SELECT * FROM harvest_waste
                WHERE harvest_id = ANY(${harvestIds})
                ORDER BY created_at DESC
            `;
            allWaste = wasteResult.rows;

            const binsResult = await sql`
                SELECT b.*,
                    (SELECT cl.next_action_at FROM bin_cure_logs cl
                     WHERE cl.bin_id = b.id ORDER BY cl.created_at DESC LIMIT 1) AS next_action_at,
                    (SELECT cl.created_at FROM bin_cure_logs cl
                     WHERE cl.bin_id = b.id ORDER BY cl.created_at DESC LIMIT 1) AS last_cure_at
                FROM harvest_bins b
                WHERE b.harvest_id = ANY(${harvestIds})
                ORDER BY b.bin_number ASC
            `;
            allBins = binsResult.rows;
        }

        const result = harvests.map((h: any) => ({
            id: h.id,
            batchId: h.batch_id,
            name: h.name,
            licenseNumber: h.license_number,
            strain: h.strain,
            plantCount: h.plant_count,
            totalWetWeight: parseFloat(h.total_wet_weight) || 0,
            totalWasteWeight: parseFloat(h.total_waste_weight) || 0,
            dryingLocation: h.drying_location,
            manicureLocation: h.manicure_location,
            status: h.status,
            isOnHold: h.is_on_hold,
            contaminants: h.contaminants || [],
            sourceBatchId: h.source_batch_id,
            dryWeight: h.dry_weight ? parseFloat(h.dry_weight) : undefined,
            moistureLossPct: parseFloat(h.moisture_loss_pct) || 75,
            harvestStartDate: h.harvest_start_date,
            harvestEndDate: h.harvest_end_date,
            submittedAt: h.submitted_at,
            approvedAt: h.approved_at,
            createdAt: h.created_at,
            allocations: allAllocations
                .filter((a: any) => a.harvest_id === h.id)
                .map((a: any) => ({
                    id: a.id,
                    harvestId: a.harvest_id,
                    allocationType: a.allocation_type,
                    targetWeight: parseFloat(a.target_weight) || 0,
                    actualWeight: parseFloat(a.actual_weight) || 0,
                    trimEntryId: a.trim_entry_id,
                    status: a.status,
                })),
            waste: allWaste
                .filter((w: any) => w.harvest_id === h.id)
                .map((w: any) => ({
                    id: w.id,
                    harvestId: w.harvest_id,
                    wasteType: w.waste_type,
                    weight: parseFloat(w.weight) || 0,
                    recordedBy: w.recorded_by,
                    createdAt: w.created_at,
                })),
            bins: allBins
                .filter((b: any) => b.harvest_id === h.id)
                .map((b: any) => ({
                    id: b.id,
                    harvestId: b.harvest_id,
                    binNumber: b.bin_number,
                    strain: b.strain,
                    licenseNumber: b.license_number,
                    weight: b.weight ? parseFloat(b.weight) : null,
                    status: b.status,
                    location: b.location,
                    buckedAt: b.bucked_at,
                    readyAt: b.ready_at,
                    trimEntryId: b.trim_entry_id,
                    createdAt: b.created_at,
                    nextActionAt: b.next_action_at,
                    lastCureAt: b.last_cure_at,
                })),
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result),
        };
    } catch (error) {
        console.error('Error fetching harvests:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch harvests' }),
        };
    }
};
