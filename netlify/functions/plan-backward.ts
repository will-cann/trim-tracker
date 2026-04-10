import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
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
 *
 * Uses pool.query throughout (not neon sql tagged template) because conditional
 * composition and array parameters are more reliable via parameterized queries.
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

interface ProductTypeRow {
    name: string;
    display_name: string;
    category: string;
    default_unit: string;
    is_cannabis: boolean;
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

        // ── Load templates, product types, historical yields ────────────
        const templatesResult = await pool.query<TemplateRow>(
            `SELECT id, name, process_type, accepted_inputs, producible_outputs
             FROM process_templates
             WHERE company_id = $1 AND is_active = true AND COALESCE(domain, 'extraction') = 'extraction'`,
            [companyId]
        );

        const productTypesResult = await pool.query<ProductTypeRow>(
            `SELECT name, display_name, category, default_unit, is_cannabis
             FROM product_types
             WHERE company_id = $1 AND is_active = true`,
            [companyId]
        );

        let yieldRows: { input_type: string; output_type: string; avg_yield_pct: string; sample_count: number }[] = [];
        if (strain) {
            const y = await pool.query(
                `SELECT input_package_type AS input_type,
                        output_package_type AS output_type,
                        ROUND(AVG(yield_percentage)::numeric, 2) AS avg_yield_pct,
                        COUNT(*)::int AS sample_count
                 FROM extraction_logs
                 WHERE company_id = $1 AND strain = $2 AND yield_percentage IS NOT NULL
                 GROUP BY input_package_type, output_package_type`,
                [companyId, strain]
            );
            yieldRows = y.rows;
        }

        const templates = templatesResult.rows;
        const productTypes = new Map<string, ProductTypeRow>();
        for (const pt of productTypesResult.rows) {
            productTypes.set(pt.name, pt);
        }

        const yieldMap = new Map<string, { avg: number; count: number }>();
        for (const row of yieldRows) {
            yieldMap.set(`${row.input_type}→${row.output_type}`, {
                avg: parseFloat(row.avg_yield_pct),
                count: row.sample_count,
            });
        }

        // ── Load all steps for extraction templates ──────────────────────
        const templateIds = templates.map(t => t.id);
        const stepsByTemplate = new Map<string, StepRow[]>();
        if (templateIds.length > 0) {
            const stepsResult = await pool.query<StepRow>(
                `SELECT id, template_id, step_order, name, input_type, output_type,
                        expected_yield_pct, is_optional
                 FROM process_steps
                 WHERE template_id = ANY($1::uuid[])
                 ORDER BY step_order ASC`,
                [templateIds]
            );
            for (const step of stepsResult.rows) {
                if (!stepsByTemplate.has(step.template_id)) stepsByTemplate.set(step.template_id, []);
                stepsByTemplate.get(step.template_id)!.push(step);
            }
        }

        // ── Walk backward to build the template chain ────────────────────
        interface ChainLink {
            template: TemplateRow;
            steps: StepRow[];
            inputType: string;
            outputType: string;
        }

        const chain: ChainLink[] = [];
        let currentTarget = targetOutputType;
        const visited = new Set<string>();

        while (true) {
            const targetPt = productTypes.get(currentTarget);
            if (targetPt?.category === 'biomass') break;
            if (visited.has(currentTarget)) {
                warnings.push(`Circular dependency detected at ${currentTarget}`);
                break;
            }
            visited.add(currentTarget);

            const matchingTemplate = templates.find(t => t.producible_outputs?.includes(currentTarget));
            if (!matchingTemplate) {
                if (!targetPt || targetPt.category !== 'biomass') {
                    warnings.push(`No SOP found that produces "${targetPt?.display_name || currentTarget}"`);
                }
                break;
            }

            const steps = (stepsByTemplate.get(matchingTemplate.id) || []).filter(s => !s.is_optional);
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

        // Empty chain → no matching SOP. Return a valid empty plan.
        if (chain.length === 0) {
            const targetPt = productTypes.get(targetOutputType);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetOutputType,
                    targetQuantity,
                    targetUnit: targetUnit || targetPt?.default_unit || 'g',
                    strain: strain || null,
                    stages: [],
                    biomassRequired: {
                        type: targetOutputType,
                        displayName: targetPt?.display_name || targetOutputType,
                        quantity: targetQuantity,
                        unit: targetUnit || targetPt?.default_unit || 'g',
                    },
                    biomassOnHand: { quantity: 0, unit: targetUnit || 'g', packages: [] },
                    biomassGap: { quantity: targetQuantity, unit: targetUnit || 'g' },
                    suppliesNeeded: [],
                    templateChain: [],
                    warnings: warnings.length > 0 ? warnings : ['No matching SOP found for this output type.'],
                }),
            };
        }

        // ── Walk forward through the chain, computing quantities ─────────
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

        const stages: PlanStage[] = [];
        let requiredOutput = targetQuantity;

        for (let i = chain.length - 1; i >= 0; i--) {
            const link = chain[i];
            const inputPt = productTypes.get(link.inputType);
            const outputPt = productTypes.get(link.outputType);

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
                    warnings.push(
                        `No yield data for ${inputPt?.display_name || link.inputType} → ${outputPt?.display_name || link.outputType}. Using 100%.`
                    );
                }
            }

            const requiredInput = yieldPct > 0 ? (requiredOutput / (yieldPct / 100)) : requiredOutput;

            stages.unshift({
                stepName: link.template.name,
                templateId: link.template.id,
                templateName: link.template.name,
                inputType: link.inputType,
                inputDisplayName: inputPt?.display_name || link.inputType.replace(/_/g, ' '),
                inputQty: Math.ceil(requiredInput * 100) / 100,
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

        const pkgParams: unknown[] = [companyId, biomassType];
        let pkgQuery = `SELECT id, label, strain, quantity, unit
                        FROM packages
                        WHERE company_id = $1
                          AND package_type = $2
                          AND status = 'active'
                          AND quantity > 0`;
        if (strain) {
            pkgParams.push(strain);
            pkgQuery += ` AND strain = $3`;
        }
        pkgQuery += ` ORDER BY quantity DESC`;

        const packagesResult = await pool.query(pkgQuery, pkgParams);
        const onHandPackages = packagesResult.rows.map((p: Record<string, unknown>) => ({
            id: p.id as string,
            label: p.label as string,
            strain: p.strain as string | null,
            quantity: parseFloat(p.quantity as string),
        }));
        const totalOnHand = onHandPackages.reduce((sum, p) => sum + p.quantity, 0);
        const gap = Math.max(0, biomassNeeded - totalOnHand);

        // ── Supply requirements across the chain ─────────────────────────
        const allStepIds = chain.flatMap(link => link.steps.map(s => s.id));
        let suppliesNeeded: { name: string; unit: string; needed: number; onHand: number; gap: number }[] = [];

        if (allStepIds.length > 0) {
            const supplyResult = await pool.query(
                `SELECT ssr.step_id, si.name AS supply_name, si.unit AS supply_unit,
                        ssr.quantity_per, si.quantity_on_hand
                 FROM step_supply_requirements ssr
                 JOIN supply_items si ON si.id = ssr.supply_item_id
                 WHERE ssr.step_id = ANY($1::uuid[])`,
                [allStepIds]
            );

            const supplyMap = new Map<string, { name: string; unit: string; needed: number; onHand: number }>();
            for (const row of supplyResult.rows as Record<string, unknown>[]) {
                const key = row.supply_name as string;
                const existing = supplyMap.get(key) || {
                    name: row.supply_name as string,
                    unit: row.supply_unit as string,
                    needed: 0,
                    onHand: parseFloat(row.quantity_on_hand as string),
                };
                existing.needed += parseFloat(row.quantity_per as string);
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
        const message = error instanceof Error ? error.message : 'Planning failed';
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Planning failed', detail: message }),
        };
    }
};
