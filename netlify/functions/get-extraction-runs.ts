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

        const status = event.queryStringParameters?.status;

        let runsResult;
        if (status) {
            runsResult = await sql`
                SELECT r.*, pt.name AS template_name, pt.process_type
                FROM extraction_runs r
                LEFT JOIN process_templates pt ON pt.id = r.template_id
                WHERE r.company_id = ${context.companyId} AND r.status = ${status}
                ORDER BY r.created_at DESC
            `;
        } else {
            runsResult = await sql`
                SELECT r.*, pt.name AS template_name, pt.process_type
                FROM extraction_runs r
                LEFT JOIN process_templates pt ON pt.id = r.template_id
                WHERE r.company_id = ${context.companyId}
                ORDER BY r.created_at DESC
            `;
        }

        const runIds = runsResult.rows.map((r: any) => r.id);

        let stepsMap: Record<string, any[]> = {};
        let sourcesMap: Record<string, any[]> = {};
        if (runIds.length > 0) {
            // Join process_steps to surface the template-level requirements
            // (requires_weight, weight_unit, requires_timestamp, equipment_type,
            // est_duration_hours) so the frontend can render the schedule-driven
            // run detail without a second round-trip. Aliased as ps_* to avoid
            // conflicts with the run-step columns.
            const stepsResult = await sql`
                SELECT s.*,
                       eq.name AS equipment_name,
                       ps.requires_weight AS ps_requires_weight,
                       ps.weight_unit AS ps_weight_unit,
                       ps.requires_timestamp AS ps_requires_timestamp,
                       ps.equipment_type AS ps_equipment_type,
                       ps.est_duration_hours AS ps_est_duration_hours
                FROM extraction_run_steps s
                LEFT JOIN extraction_equipment eq ON eq.id = s.equipment_id
                LEFT JOIN process_steps ps ON ps.id = s.template_step_id
                WHERE s.run_id = ANY(${runIds})
                ORDER BY s.step_order ASC
            `;
            for (const row of stepsResult.rows) {
                const rid = row.run_id;
                if (!stepsMap[rid]) stepsMap[rid] = [];
                stepsMap[rid].push(formatStep(row));
            }

            const sourcesResult = await sql`
                SELECT rs.run_id, rs.package_id, rs.quantity_used,
                       p.label, p.package_type, p.strain, p.quantity, p.unit
                FROM extraction_run_sources rs
                LEFT JOIN packages p ON p.id = rs.package_id
                WHERE rs.run_id = ANY(${runIds})
            `;
            for (const row of sourcesResult.rows) {
                const rid = row.run_id;
                if (!sourcesMap[rid]) sourcesMap[rid] = [];
                sourcesMap[rid].push({
                    packageId: row.package_id,
                    label: row.label,
                    packageType: row.package_type,
                    strain: row.strain,
                    quantity: row.quantity ? parseFloat(row.quantity) : null,
                    unit: row.unit,
                    quantityUsed: row.quantity_used ? parseFloat(row.quantity_used) : null,
                });
            }
        }

        const runs = runsResult.rows.map((r: any) => ({
            id: r.id,
            companyId: r.company_id,
            templateId: r.template_id,
            templateName: r.template_name || null,
            processType: r.process_type || null,
            name: r.name,
            strain: r.strain,
            inputMaterial: r.input_material,
            targetProduct: r.target_product,
            status: r.status,
            plannedStart: r.planned_start,
            sourcePackageId: r.source_package_id,
            parentRunId: r.parent_run_id,
            startedAt: r.started_at,
            completedAt: r.completed_at,
            sourcesConsumedAt: r.sources_consumed_at || null,
            notes: r.notes,
            sourcePackages: sourcesMap[r.id] || [],
            steps: stepsMap[r.id] || [],
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(runs),
        };
    } catch (error) {
        console.error('Error fetching extraction runs:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch extraction runs' }) };
    }
};

function formatStep(row: any) {
    return {
        id: row.id,
        runId: row.run_id,
        templateStepId: row.template_step_id,
        stepOrder: row.step_order,
        name: row.name,
        status: row.status,
        inputWeightG: row.input_weight_g ? parseFloat(row.input_weight_g) : null,
        outputWeightG: row.output_weight_g ? parseFloat(row.output_weight_g) : null,
        yieldPct: row.yield_pct ? parseFloat(row.yield_pct) : null,
        equipmentId: row.equipment_id,
        equipmentName: row.equipment_name || null,
        isOptional: row.is_optional,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        notes: row.notes,
        description: row.description || null,
        // Template-level requirements (joined from process_steps)
        requiresWeight: row.ps_requires_weight ?? false,
        weightUnit: row.ps_weight_unit || null,
        requiresTimestamp: row.ps_requires_timestamp ?? false,
        equipmentType: row.ps_equipment_type || null,
        estDurationHours: row.ps_est_duration_hours != null ? parseFloat(row.ps_est_duration_hours) : null,
        // Runtime check-in values (from extraction_run_steps)
        checkInValue: row.check_in_value != null ? parseFloat(row.check_in_value) : null,
        checkInUnit: row.check_in_unit || null,
        timestampCapturedAt: row.timestamp_captured_at || null,
    };
}
