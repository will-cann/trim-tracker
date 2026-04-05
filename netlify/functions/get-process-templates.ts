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

        const domain = event.queryStringParameters?.domain || null;

        // Check if company has any templates — if not, seed presets
        const countResult = await sql`
            SELECT COUNT(*) as count FROM process_templates WHERE company_id = ${context.companyId}
        `;
        if (parseInt(countResult.rows[0].count) === 0) {
            await seedPresets(context.companyId);
        }

        // Fetch templates with steps, optionally filtered by domain
        const templates = domain
            ? await sql`
                SELECT * FROM process_templates
                WHERE company_id = ${context.companyId} AND is_active = true AND COALESCE(domain, 'extraction') = ${domain}
                ORDER BY is_preset DESC, name ASC
            `
            : await sql`
                SELECT * FROM process_templates
                WHERE company_id = ${context.companyId} AND is_active = true
                ORDER BY is_preset DESC, name ASC
            `;

        const templateIds = templates.rows.map((t: any) => t.id);

        let stepsMap: Record<string, any[]> = {};
        if (templateIds.length > 0) {
            const steps = await sql`
                SELECT * FROM process_steps
                WHERE template_id = ANY(${templateIds})
                ORDER BY step_order ASC
            `;
            for (const step of steps.rows) {
                const tid = step.template_id;
                if (!stepsMap[tid]) stepsMap[tid] = [];
                stepsMap[tid].push(formatStep(step));
            }
        }

        const result = templates.rows.map((t: any) => ({
            ...formatTemplate(t),
            steps: stepsMap[t.id] || [],
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result),
        };
    } catch (error) {
        console.error('Error fetching process templates:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch process templates' }) };
    }
};

function formatTemplate(row: any) {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        processType: row.process_type,
        domain: row.domain || 'extraction',
        phaseDurations: row.phase_durations || null,
        acceptedInputs: row.accepted_inputs || [],
        isPreset: row.is_preset,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function formatStep(row: any) {
    return {
        id: row.id,
        templateId: row.template_id,
        stepOrder: row.step_order,
        name: row.name,
        description: row.description,
        inputType: row.input_type,
        outputType: row.output_type,
        equipmentType: row.equipment_type,
        expectedYieldPct: row.expected_yield_pct ? parseFloat(row.expected_yield_pct) : null,
        estDurationHours: row.est_duration_hours ? parseFloat(row.est_duration_hours) : null,
        estHandsOnHours: row.est_hands_on_hours ? parseFloat(row.est_hands_on_hours) : null,
        isOptional: row.is_optional,
        // Cultivation fields
        track: row.track || null,
        phase: row.phase || null,
        phaseWeek: row.phase_week || null,
        phaseDay: row.phase_day || null,
        isSpan: row.is_span || false,
        spanEndWeek: row.span_end_week || null,
        envTargets: row.env_targets || null,
        taskCategory: row.task_category || null,
        onCompleteAction: row.on_complete_action || null,
        requiresSupplies: row.requires_supplies || null,
        isCritical: row.is_critical || false,
        recurrence: row.recurrence || null,
    };
}

// ── Preset templates seeded on first access ─────────────────────────────────

async function seedPresets(companyId: string) {
    const presets = [
        {
            name: 'Solventless — Fresh Frozen to Rosin',
            description: 'Ice water hash extraction followed by rosin press. Optional decarb and cart filling for vape products.',
            processType: 'solventless',
            steps: [
                { order: 1, name: 'Wash', desc: 'Ice water agitation to separate trichomes. Use multiple micron bags (45u, 73u, 120u, 160u).', input: 'fresh_frozen', output: 'bubble_hash', equip: 'wash_vessel', yield: 5, hours: 2, optional: false },
                { order: 2, name: 'Freeze Dry', desc: 'Sublimation drying to remove moisture without melting trichome heads. 24-48h cycle typical.', input: 'bubble_hash', output: 'bubble_hash', equip: 'freeze_dryer', yield: 96, hours: 24, optional: false },
                { order: 3, name: 'Press', desc: 'Heat and pressure to extract rosin from hash. Typical: 170-220°F, 37-90u bags.', input: 'bubble_hash', output: 'rosin', equip: 'rosin_press', yield: 60, hours: 1, optional: false },
                { order: 4, name: 'Decarb', desc: 'Decarboxylation for edibles or cartridges. ~220°F for 30-40 min in vacuum oven.', input: 'rosin', output: 'rosin', equip: 'vacuum_oven', yield: 95, hours: 2, optional: true },
                { order: 5, name: 'Fill Carts', desc: 'Fill vape cartridges with decarbed rosin. 0.5g or 1g per cart.', input: 'rosin', output: 'rosin_cart', equip: 'cart_filler', yield: 95, hours: 2, optional: true },
                { order: 6, name: 'Package', desc: 'Final packaging and labeling for retail or wholesale.', input: 'rosin_cart', output: 'rosin_cart', equip: null, yield: 100, hours: 1, optional: true },
            ],
        },
        {
            name: 'BHO — Hydrocarbon Extraction',
            description: 'Closed-loop butane/propane extraction. Produces shatter, wax, budder, live resin, or diamonds depending on post-processing.',
            processType: 'bho',
            steps: [
                { order: 1, name: 'Extract', desc: 'Closed-loop hydrocarbon extraction. Butane, propane, or blend. Column packed with material, solvent washed through.', input: 'fresh_frozen', output: 'crude_extract', equip: 'closed_loop_extractor', yield: 15, hours: 4, optional: false },
                { order: 2, name: 'Purge / Dewax', desc: 'Vacuum purge to remove residual solvent. Dewax in freezer if needed. Thin film on parchment for shatter, whip for badder.', input: 'crude_extract', output: 'bho_concentrate', equip: 'vacuum_oven', yield: 90, hours: 24, optional: false },
                { order: 3, name: 'Pour / Cure', desc: 'For diamonds: solvent-rich pour into jar, cap loosely, cure at room temp 2-4 weeks for crystallization. For sauce: separate terpene layer.', input: 'bho_concentrate', output: 'bho_concentrate', equip: null, yield: 95, hours: 48, optional: true },
                { order: 4, name: 'Package', desc: 'Jar, weigh, label. Separate diamonds and sauce if applicable.', input: 'bho_concentrate', output: 'bho_concentrate', equip: null, yield: 100, hours: 1, optional: false },
            ],
        },
        {
            name: 'Distillate — Short Path',
            description: 'Ethanol or hydrocarbon crude refined via winterization, filtration, and short-path distillation.',
            processType: 'distillate',
            steps: [
                { order: 1, name: 'Extract', desc: 'Initial crude extraction using ethanol or hydrocarbon solvent.', input: 'trim', output: 'crude_extract', equip: 'closed_loop_extractor', yield: 12, hours: 4, optional: false },
                { order: 2, name: 'Winterize', desc: 'Dissolve crude in ethanol, freeze overnight to precipitate fats and waxes.', input: 'crude_extract', output: 'winterized', equip: null, yield: 85, hours: 12, optional: false },
                { order: 3, name: 'Filter', desc: 'Vacuum filter to remove precipitated waxes. Buchner funnel or filter press.', input: 'winterized', output: 'filtered', equip: 'filter_press', yield: 95, hours: 2, optional: false },
                { order: 4, name: 'Distill', desc: 'Short-path distillation. First pass removes terpenes, second pass collects main body. 150-220°C.', input: 'filtered', output: 'distillate', equip: 'short_path', yield: 80, hours: 6, optional: false },
                { order: 5, name: 'Package', desc: 'Syringe, jar, or fill carts with distillate.', input: 'distillate', output: 'distillate', equip: null, yield: 100, hours: 1, optional: false },
            ],
        },
    ];

    for (const preset of presets) {
        const tResult = await sql`
            INSERT INTO process_templates (company_id, name, description, process_type, domain, is_preset)
            VALUES (${companyId}, ${preset.name}, ${preset.description}, ${preset.processType}, 'extraction', true)
            RETURNING id
        `;
        const templateId = tResult.rows[0].id;

        for (const step of preset.steps) {
            await sql`
                INSERT INTO process_steps (
                    template_id, step_order, name, description,
                    input_type, output_type, equipment_type,
                    expected_yield_pct, est_duration_hours, is_optional
                ) VALUES (
                    ${templateId}, ${step.order}, ${step.name}, ${step.desc},
                    ${step.input}, ${step.output}, ${step.equip},
                    ${step.yield}, ${step.hours}, ${step.optional}
                )
            `;
        }
    }
}
