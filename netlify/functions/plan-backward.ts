import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * POST /plan-backward
 *
 * Demand-backward planning engine. Given a target output type and quantity,
 * walk backward through SOP templates using yield percentages to determine
 * input requirements. Chains across templates via producible_outputs →
 * accepted_inputs matching.
 *
 * Body: { targetOutputType, targetQuantity, targetUnit?, strain? }
 *
 * Returns: { stages[], biomassRequired, biomassOnHand, biomassGap,
 *            suppliesNeeded[], templateChain[], warnings[] }
 */

interface TemplateRow {
    id: string;
    name: string;
    process_type: string;
    accepted_inputs: string[];
    producible_outputs: string[];
}

interface StepRow {
    id: string;
    template_id: string;
    step_order: number;
    name: string;
    input_type: string | null;
    output_type: string | null;
    expected_yield_pct: string | null;
    is_optional: boolean;
}

interface YieldRow {
    input_type: string;
    output_type: string;
    avg_yield_pct: string;
    sample_count: number;
}

interface ProductTypeRow {
    name: string;
    display_name: string;
    category: string;
    default_unit: string;
    is_cannabis: boolean;
}

interface SupplyReqRow {
    step_id: string;
    supply_name: string;
    supply_unit: string;
    quantity_per: string;
    quantity_on_hand: string;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const { targetOutputType, targetQuantity, targetUnit, strain } = JSON.parse(event.body || '{}');
        if (!targetOutputType || !targetQuantity || targetQuantity <= 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'targetOutputType and targetQuantity > 0 are required' }) };
        }

        const companyId = context.companyId;
        const warnings: string[] = [];

        // ── Load data ────────────────────────────────────────────────────
        const [templatesResult, productTypesResult, yieldResult] = await Promise.all([
            sql`SELECT id, name, process_type, accepted_inputs, producible_outputs
                FROM process_templates
                WHERE company_id = ${companyId} AND is_active = true AND COALESCE(domain, 'extraction') = 'extraction'`,
            sql`SELECT name, display_name, category, default_unit, is_cannabis
                FROM product_types
                WHERE company_id = ${companyId} AND is_active = true`,
            strain
                ? sql`SELECT input_package_type AS input_type, output_package_type AS output_type,
                             ROUND(AVG(yield_percentage)::numeric, 2) AS avg_yield_pct,
                             COUNT(*)::int AS sample_count
                      FROM extraction_logs
                      WHERE company_id = ${companyId} AND strain = ${strain} AND yield_percentage IS NOT NULL
                      GROUP BY input_package_type, output_package_type`
                : sql`SELECT NULL AS input_type WHERE FALSE`, // no-op
        ]);

        const templates: TemplateRow[] = templatesResult.rows;
        const productTypes = new Map<string, ProductTypeRow>();
        for (const pt of productTypesResult.rows) {
            productTypes.set(pt.name, pt);
        }

        // Historical yield lookup: (inputType, outputType) → { avgYieldPct, sampleCount }
        const yieldMap = new Map<string, { avg: number; count: number }>();
        for (const row of yieldResult.rows as YieldRow[]) {
            yieldMap.set(`${row.input_type}→${row.output_type}`, {
                avg: parseFloat(row.avg_yield_pct),
                count: row.sample_count,
            });
        }

        // Load all steps for extraction templates
        const templateIds = templates.map(t => t.id);
        const stepsResult = templateIds.length > 0
            ? await sql`SELECT id, template_id, step_order, name, input_type, output_type, expected_yield_pct, is_optional
                        FROM process_steps WHERE template_id = ANY(${templateIds}) ORDER BY step_order ASC`
            : { rows: [] };
        const stepsByTemplate = new Map<string, StepRow[]>();
        for (const step of stepsResult.rows as StepRow[]) {
            if (!stepsByTemplate.has(step.template_id)) stepsByTemplate.set(step.template_id, []);
            stepsByTemplate.get(step.template_id)!.push(step);
        }

        // ── Find template chain ──────────────────────────────────────────
        // Walk backward: start from target output, find a template that
        // produces it, then find a template that produces THAT template's
        // input, and so on until we reach biomass (category = 'biomass').

        interface ChainLink {
            template: TemplateRow;
            steps: StepRow[];
            inputType: string;
            outputType: string;
        }

        const chain: ChainLink[] = [];
        let currentTarget = targetOutputType;
        const visited = new Set<string>(); // prevent infinite loops

        while (true) {
            const targetPt = productTypes.get(currentTarget);
            if (targetPt?.category === 'biomass') break; // reached raw material
            if (visited.has(currentTarget)) {
                warnings.push(`Circular dependency detected at ${currentTarget}`);
                break;
            }
            visited.add(currentTarget);

            // Find a template that produces currentTarget
            const matchingTemplate = templates.find(t =>
                t.producible_outputs?.includes(currentTarget)
            );

            if (!matchingTemplate) {
                // No template produces this — if it's not biomass, it's a gap
                if (!targetPt || targetPt.category !== 'biomass') {
                    warnings.push(`No SOP found that produces "${productTypes.get(currentTarget)?.display_name || currentTarget}"`);
                }
                break;
            }

            const steps = (stepsByTemplate.get(matchingTemplate.id) || [])
                .filter(s => !s.is_optional);

            // Determine the input type: first required step's input_type,
            // or template's accepted_inputs[0]
            const firstInput = steps[0]?.input_type
                || (matchingTemplate.accepted_inputs?.length > 0 ? matchingTemplate.accepted_inputs[0] : null);

            if (!firstInput) {
                warnings.push(`Template "${matchingTemplate.name}" has no input type defined`);
                break;
            }

            chain.unshift({
                template: matchingTemplate,
                steps,
                inputType: firstInput,
                outputType: currentTarget,
            });

            currentTarget = firstInput;
        }

        if (chain.length === 0) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetOutputType,
                    targetQuantity,
                    targetUnit: targetUnit || 'g',
                    strain: strain || null,
                    stages: [],
                    biomassRequired: { type: currentTarget, displayName: productTypes.get(currentTarget)?.display_name || currentTarget, quantity: targetQuantity, unit: targetUnit || 'g' },
                    biomassOnHand: { quantity: 0, unit: targetUnit || 'g', packages: [] },
                    biomassGap: { quantity: targetQuantity, unit: targetUnit || 'g' },
                    suppliesNeeded: [],
                    templateChain: [],
                    warnings: warnings.length > 0 ? warnings : ['No matching templates found for this output type.'],
                }),
            };
        }

        // ── Walk forward through chain, applying yields ──────────────────
        // We know the final output quantity. Walk backward to compute input
        // needed at each stage, then present stages in forward order.

        interface PlanStage {
            stepName: string;
            templateId: string;
            templateName: string;
            inputType: string;
            inputDisplayName: string;
            inputQty: number;
            inputUnit: string;
            outputType: string;
            outputDisplayName: string;
            outputQty: number;
            outputUnit: string;
            yieldPct: number;
            yieldSource: 'historical_avg' | 'template_default' | 'assumed';
            sampleCount?: number;
        }

        // Compute cumulative yield backward from target
        const stages: PlanStage[] = [];
        let requiredOutput = targetQuantity;

        for (let i = chain.length - 1; i >= 0; i--) {
            const link = chain[i];
            const inputPt = productTypes.get(link.inputType);
            const outputPt = productTypes.get(link.outputType);

            // Determine yield: historical > template > assumed
            let yieldPct = 100;
            let yieldSource: 'historical_avg' | 'template_default' | 'assumed' = 'assumed';
            let sampleCount: number | undefined;

            const histKey = `${link.inputType}→${link.outputType}`;
            const hist = yieldMap.get(histKey);
            if (hist && hist.count >= 1) {
                yieldPct = hist.avg;
                yieldSource = 'historical_avg';
                sampleCount = hist.count;
            } else {
                // Compute cumulative expected yield from template steps
                const cumulativeYield = link.steps.reduce((acc, step) => {
                    const stepYield = step.expected_yield_pct ? parseFloat(step.expected_yield_pct) : 100;
                    return acc * (stepYield / 100);
                }, 1) * 100;

                if (cumulativeYield > 0 && cumulativeYield < 100) {
                    yieldPct = Math.round(cumulativeYield * 100) / 100;
                    yieldSource = 'template_default';
                } else {
                    warnings.push(`No yield data for ${inputPt?.display_name || link.inputType} → ${outputPt?.display_name || link.outputType}. Using 100%.`);
                }
            }

            const requiredInput = yieldPct > 0 ? (requiredOutput / (yieldPct / 100)) : requiredOutput;

            stages.unshift({
                stepName: link.template.name,
                templateId: link.template.id,
                templateName: link.template.name,
                inputType: link.inputType,
                inputDisplayName: inputPt?.display_name || link.inputType.replace(/_/g, ' '),
                inputQty: Math.ceil(requiredInput * 100) / 100, // round up to 2 decimals
                inputUnit: inputPt?.default_unit || 'g',
                outputType: link.outputType,
                outputDisplayName: outputPt?.display_name || link.outputType.replace(/_/g, ' '),
                outputQty: Math.ceil(requiredOutput * 100) / 100,
                outputUnit: outputPt?.default_unit || targetUnit || 'g',
                yieldPct,
                yieldSource,
                sampleCount,
            });

            requiredOutput = requiredInput;
        }

        // ── Biomass inventory check ──────────────────────────────────────
        const biomassType = chain[0].inputType;
        const biomassPt = productTypes.get(biomassType);
        const biomassUnit = biomassPt?.default_unit || 'g';
        const biomassNeeded = stages[0]?.inputQty || targetQuantity;

        const packagesResult = await sql`
            SELECT id, label, strain, quantity, unit
            FROM packages
            WHERE company_id = ${companyId}
              AND package_type = ${biomassType}
              AND status = 'active'
              AND quantity > 0
              ${strain ? sql`AND strain = ${strain}` : sql``}
            ORDER BY quantity DESC
        `;

        const onHandPackages = packagesResult.rows.map((p: any) => ({
            id: p.id,
            label: p.label,
            strain: p.strain,
            quantity: parseFloat(p.quantity),
        }));
        const totalOnHand = onHandPackages.reduce((sum: number, p: any) => sum + p.quantity, 0);
        const gap = Math.max(0, biomassNeeded - totalOnHand);

        // ── Supply requirements along the chain ──────────────────────────
        const allStepIds = chain.flatMap(link => link.steps.map(s => s.id));
        let suppliesNeeded: { name: string; unit: string; needed: number; onHand: number; gap: number }[] = [];

        if (allStepIds.length > 0) {
            const supplyResult = await sql`
                SELECT ssr.step_id, si.name AS supply_name, si.unit AS supply_unit,
                       ssr.quantity_per, si.quantity_on_hand
                FROM step_supply_requirements ssr
                JOIN supply_items si ON si.id = ssr.supply_item_id
                WHERE ssr.step_id = ANY(${allStepIds})
            `;

            // Aggregate by supply name (same supply used across steps)
            const supplyMap = new Map<string, { name: string; unit: string; needed: number; onHand: number }>();
            for (const row of supplyResult.rows as SupplyReqRow[]) {
                const key = row.supply_name;
                const existing = supplyMap.get(key) || { name: row.supply_name, unit: row.supply_unit, needed: 0, onHand: parseFloat(row.quantity_on_hand) };
                existing.needed += parseFloat(row.quantity_per);
                supplyMap.set(key, existing);
            }
            suppliesNeeded = Array.from(supplyMap.values()).map(s => ({
                ...s,
                gap: Math.max(0, s.needed - s.onHand),
            }));
        }

        // ── Response ─────────────────────────────────────────────────────
        const plan = {
            targetOutputType,
            targetQuantity,
            targetUnit: targetUnit || productTypes.get(targetOutputType)?.default_unit || 'g',
            strain: strain || null,
            stages,
            biomassRequired: {
                type: biomassType,
                displayName: biomassPt?.display_name || biomassType.replace(/_/g, ' '),
                quantity: Math.ceil(biomassNeeded * 100) / 100,
                unit: biomassUnit,
            },
            biomassOnHand: {
                quantity: totalOnHand,
                unit: biomassUnit,
                packages: onHandPackages,
            },
            biomassGap: {
                quantity: Math.ceil(gap * 100) / 100,
                unit: biomassUnit,
            },
            suppliesNeeded,
            templateChain: chain.map(link => ({ id: link.template.id, name: link.template.name })),
            warnings,
        };

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(plan),
        };
    } catch (error) {
        console.error('Error in plan-backward:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Planning failed' }) };
    }
};
