import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext } from './utils/auth';

/**
 * POST /plan-backward
 *
 * Multi-target demand-backward planning engine. Accepts a list of targets
 * (outputType + qty + optional strain) and walks each one backward through
 * SOP templates using yield percentages. Stages that share the same
 * (templateId, strain) are merged. Biomass requirements are bucketed by
 * (inputType, strain) so the UI can show "5 kg FF Blue Dream / 5 kg FF Gelato"
 * separately.
 *
 * Body (new):   { targets: [{ outputType, quantity, unit?, strain? }, ...] }
 * Body (legacy): { targetOutputType, targetQuantity, targetUnit?, strain? }
 */

interface TemplateRow {
    id: string;
    name: string;
    process_type: string;
    accepted_inputs: string[];
    producible_outputs: string[];
}

interface ProductTypeRowFull {
    name: string;
    display_name: string;
    category: string;
    default_unit: string;
    is_cannabis: boolean;
    process_types: string[];
    gram_weight: number | null;
}

interface StepRow {
    id: string;
    template_id: string;
    step_order: number;
    name: string;
    input_type: string | null;
    output_type: string | null;
    expected_yield_pct: string | null;
    equipment_type: string | null;
    is_optional: boolean;
}

interface PlanTargetInput {
    outputType: string;
    quantity: number;
    unit?: string;
    strain?: string | null;
}

interface ChainLink {
    template: TemplateRow;
    steps: StepRow[];
    inputType: string;
    outputType: string;
}

interface PlanStage {
    key: string; // `${templateId}::${strain || 'any'}`
    stepName: string;
    templateId: string;
    templateName: string;
    strain: string | null;
    inputType: string;
    inputDisplayName: string;
    inputQty: number;
    inputUnit: string;
    outputType: string;
    outputDisplayName: string;
    outputQty: number;
    outputUnit: string;
    // Internal: the stage's output in grams, used for supply scaling and
    // downstream chain math even when the displayed unit is 'each'.
    outputGrams: number;
    yieldPct: number;
    yieldSource: 'historical_avg' | 'template_default' | 'assumed' | 'manual_override';
    sampleCount?: number;
    contributingTargets: number[];
}

interface SuggestedSupplier {
    vendorId: string;
    name: string;
    contactEmail: string | null;
    lastContactedAt: string | null;
    isSpecificMatch: boolean;
}

interface BiomassBucket {
    type: string;
    displayName: string;
    strain: string | null;
    quantity: number;
    unit: string;
    onHandGrams?: number;
    shortfallGrams?: number;
    suggestedSuppliers?: SuggestedSupplier[];
}

interface BiomassOnHandBucket {
    type: string;
    strain: string | null;
    quantity: number;
    unit: string;
    packages: { id: string; label: string; strain: string | null; quantity: number }[];
}

interface SupplyNeed {
    name: string;
    unit: string;
    needed: number;
    onHand: number;
    gap: number;
}

interface ResolvedTarget extends PlanTargetInput {
    displayName: string;
    resolvedUnit: string;
}

interface BackwardPlan {
    targets: ResolvedTarget[];
    stages: PlanStage[];
    biomassRequired: BiomassBucket[];
    biomassOnHand: BiomassOnHandBucket[];
    biomassGap: BiomassBucket[];
    suppliesNeeded: SupplyNeed[];
    warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Chain walk: from a target output type, walk back through templates until
// we hit a biomass type. Returns the chain in forward order (root → leaf).
// ─────────────────────────────────────────────────────────────────────────────
function buildChain(
    targetOutputType: string,
    templates: TemplateRow[],
    productTypes: Map<string, ProductTypeRowFull>,
    stepsByTemplate: Map<string, StepRow[]>,
    warnings: string[],
): ChainLink[] {
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

        const candidates = templates.filter(t => t.producible_outputs?.includes(currentTarget));
        if (candidates.length === 0) {
            if (!targetPt || targetPt.category !== 'biomass') {
                warnings.push(`No SOP found that produces "${targetPt?.display_name || currentTarget}"`);
            }
            break;
        }

        // Rank: pathway match first, then shortest chain, then name for stability.
        const targetPathways = new Set(targetPt?.process_types || []);
        const scoreTemplate = (t: TemplateRow): number => {
            const steps = (stepsByTemplate.get(t.id) || []).filter(s => !s.is_optional);
            const pathwayMatch = targetPathways.size === 0 || targetPathways.has(t.process_type) ? 0 : 1000;
            return pathwayMatch + steps.length;
        };
        const matchingTemplate = [...candidates].sort((a, b) => {
            const sa = scoreTemplate(a);
            const sb = scoreTemplate(b);
            if (sa !== sb) return sa - sb;
            return a.name.localeCompare(b.name);
        })[0];

        if (candidates.length > 1) {
            const others = candidates.filter(c => c.id !== matchingTemplate.id).map(c => c.name).join(', ');
            warnings.push(`Multiple SOPs produce "${targetPt?.display_name || currentTarget}". Using "${matchingTemplate.name}" (alternatives: ${others}).`);
        }

        const steps = (stepsByTemplate.get(matchingTemplate.id) || []).filter(s => !s.is_optional);
        const firstInput = steps[0]?.input_type
            || (matchingTemplate.accepted_inputs?.length > 0 ? matchingTemplate.accepted_inputs[0] : null);
        if (!firstInput) {
            warnings.push(`Template "${matchingTemplate.name}" has no input type defined`);
            break;
        }

        chain.unshift({ template: matchingTemplate, steps, inputType: firstInput, outputType: currentTarget });
        currentTarget = firstInput;
    }

    return chain;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compute stages for a single target along a pre-built chain. Internal math
// runs in grams; the leaf stage (the one producing the user-facing target)
// displays its output in the target's native unit so "1000 rosin carts"
// reads as "1000 carts" in the UI even though the backward math was 500 g.
// ─────────────────────────────────────────────────────────────────────────────
function stagesForTarget(
    target: PlanTargetInput,
    targetIdx: number,
    chain: ChainLink[],
    productTypes: Map<string, ProductTypeRowFull>,
    yieldMapByStrain: Map<string, Map<string, { avg: number; count: number }>>,
    overrideMap: Map<string, number>,
    warnings: string[],
): PlanStage[] {
    const stages: PlanStage[] = [];
    const strainKey = target.strain || '';
    const yieldMap = yieldMapByStrain.get(strainKey);

    // Each→gram conversion for the target. If the target is measured in an
    // each-unit (carts, pens) we multiply by gram_weight before walking the
    // yield chain. Without gram_weight we can't compute biomass — warn loudly.
    const targetPt = productTypes.get(target.outputType);
    const unit = (target.unit || targetPt?.default_unit || 'g').toLowerCase();
    const isEachTarget = unit !== 'g' && unit !== 'grams' && unit !== 'kg';
    let targetGrams = target.quantity;
    if (isEachTarget) {
        if (!targetPt?.gram_weight || targetPt.gram_weight <= 0) {
            warnings.push(
                `${targetPt?.display_name || target.outputType} has no fill weight set. Can't compute biomass — set a gram weight in the product catalog.`
            );
            return [];
        }
        targetGrams = target.quantity * Number(targetPt.gram_weight);
    }

    let requiredOutputGrams = targetGrams;

    for (let i = chain.length - 1; i >= 0; i--) {
        const link = chain[i];
        const inputPt = productTypes.get(link.inputType);
        const outputPt = productTypes.get(link.outputType);

        let yieldPct = 100;
        let yieldSource: 'historical_avg' | 'template_default' | 'assumed' | 'manual_override' = 'assumed';
        let sampleCount: number | undefined;

        // Lookup order: manual override → historical → template default.
        const overrideKey = `${target.strain || ''}::${link.template.id}::${link.inputType}::${link.outputType}`;
        const override = overrideMap.get(overrideKey);
        if (override != null) {
            yieldPct = override;
            yieldSource = 'manual_override';
        } else {
            const histKey = `${link.inputType}→${link.outputType}`;
            const hist = yieldMap?.get(histKey);
            if (hist && hist.count >= 1) {
                yieldPct = hist.avg;
                yieldSource = 'historical_avg';
                sampleCount = hist.count;
            } else {
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
        }

        const requiredInputGrams = yieldPct > 0 ? (requiredOutputGrams / (yieldPct / 100)) : requiredOutputGrams;
        const strain = target.strain || null;

        // The leaf stage (the one whose output matches the user's target) can
        // display in the target's native unit. Every other stage stays in grams.
        const isLeaf = i === chain.length - 1;
        const leafUsesEach = isLeaf && isEachTarget;
        const outputUnitDisplay = leafUsesEach
            ? (target.unit || outputPt?.default_unit || 'each')
            : (outputPt?.default_unit || 'g');
        const outputQtyDisplay = leafUsesEach
            ? target.quantity
            : requiredOutputGrams;

        stages.unshift({
            key: `${link.template.id}::${strain || 'any'}`,
            stepName: link.template.name,
            templateId: link.template.id,
            templateName: link.template.name,
            strain,
            inputType: link.inputType,
            inputDisplayName: inputPt?.display_name || link.inputType.replace(/_/g, ' '),
            inputQty: Math.ceil(requiredInputGrams * 100) / 100,
            inputUnit: inputPt?.default_unit || 'g',
            outputType: link.outputType,
            outputDisplayName: outputPt?.display_name || link.outputType.replace(/_/g, ' '),
            outputQty: Math.ceil(outputQtyDisplay * 100) / 100,
            outputUnit: outputUnitDisplay,
            outputGrams: Math.ceil(requiredOutputGrams * 100) / 100,
            yieldPct,
            yieldSource,
            sampleCount,
            contributingTargets: [targetIdx],
        });

        requiredOutputGrams = requiredInputGrams;
    }
    return stages;
}

// Merge two stages that share the same `key`: sum quantities, union target refs.
// Yields stay with whichever was computed first (they should be identical anyway
// for same template+strain, since the yield lookup is deterministic).
function mergeStage(a: PlanStage, b: PlanStage): PlanStage {
    return {
        ...a,
        inputQty: Math.ceil((a.inputQty + b.inputQty) * 100) / 100,
        outputQty: Math.ceil((a.outputQty + b.outputQty) * 100) / 100,
        outputGrams: Math.ceil((a.outputGrams + b.outputGrams) * 100) / 100,
        contributingTargets: [...a.contributingTargets, ...b.contributingTargets],
    };
}

// ─────────────────────────────────────────────────────────────────────────────

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const body = JSON.parse(event.body || '{}');

        // Accept either { targets: [...] } or the legacy single-target shape.
        let rawTargets: PlanTargetInput[];
        if (Array.isArray(body.targets)) {
            rawTargets = body.targets;
        } else if (body.targetOutputType && body.targetQuantity) {
            rawTargets = [{
                outputType: body.targetOutputType,
                quantity: body.targetQuantity,
                unit: body.targetUnit,
                strain: body.strain,
            }];
        } else {
            return { statusCode: 400, body: JSON.stringify({ error: 'targets[] or {targetOutputType, targetQuantity} required' }) };
        }

        // Validate
        for (const t of rawTargets) {
            if (!t.outputType || !t.quantity || t.quantity <= 0) {
                return { statusCode: 400, body: JSON.stringify({ error: 'each target needs outputType and quantity > 0' }) };
            }
        }

        const companyId = context.companyId;
        const warnings: string[] = [];

        // ── Shared loads ────────────────────────────────────────────────
        const templatesResult = await pool.query<TemplateRow>(
            `SELECT id, name, process_type, accepted_inputs, producible_outputs
             FROM process_templates
             WHERE company_id = $1 AND is_active = true AND COALESCE(domain, 'extraction') = 'extraction'`,
            [companyId]
        );
        const productTypesResult = await pool.query<ProductTypeRowFull>(
            `SELECT name, display_name, category, default_unit, is_cannabis,
                    COALESCE(process_types, '{}'::text[]) AS process_types,
                    gram_weight
             FROM product_types
             WHERE company_id = $1 AND is_active = true`,
            [companyId]
        );
        const templates = templatesResult.rows;
        const productTypes = new Map<string, ProductTypeRowFull>();
        for (const pt of productTypesResult.rows) productTypes.set(pt.name, pt);

        const templateIds = templates.map(t => t.id);
        const stepsByTemplate = new Map<string, StepRow[]>();
        if (templateIds.length > 0) {
            const stepsResult = await pool.query<StepRow>(
                `SELECT id, template_id, step_order, name, input_type, output_type,
                        expected_yield_pct, equipment_type, is_optional
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

        // Manual strain yield overrides — loaded for every referenced strain
        // in a single query. Keyed on `${strain}::${templateId}::${in}::${out}`
        // so the lookup inside stagesForTarget is O(1) per link.
        const overrideMap = new Map<string, number>();
        // Yield data: one query covering every referenced strain.
        const strainsReferenced = Array.from(new Set(
            rawTargets.map(t => t.strain).filter((s): s is string => !!s)
        ));
        if (strainsReferenced.length > 0) {
            const overrideRes = await pool.query(
                `SELECT strain, template_id, input_type, output_type, yield_pct
                 FROM strain_yield_overrides
                 WHERE company_id = $1 AND strain = ANY($2::text[])`,
                [companyId, strainsReferenced]
            );
            for (const row of overrideRes.rows as Record<string, unknown>[]) {
                overrideMap.set(
                    `${row.strain}::${row.template_id}::${row.input_type}::${row.output_type}`,
                    parseFloat(row.yield_pct as string),
                );
            }
        }
        const yieldMapByStrain = new Map<string, Map<string, { avg: number; count: number }>>();
        yieldMapByStrain.set('', new Map()); // "any strain" bucket (empty lookups fall through to template defaults)
        if (strainsReferenced.length > 0) {
            const yieldRes = await pool.query(
                `SELECT strain,
                        input_package_type AS input_type,
                        output_package_type AS output_type,
                        ROUND(AVG(yield_percentage)::numeric, 2) AS avg_yield_pct,
                        COUNT(*)::int AS sample_count
                 FROM extraction_logs
                 WHERE company_id = $1 AND strain = ANY($2::text[]) AND yield_percentage IS NOT NULL
                 GROUP BY strain, input_package_type, output_package_type`,
                [companyId, strainsReferenced]
            );
            for (const row of yieldRes.rows as Record<string, unknown>[]) {
                const strain = row.strain as string;
                if (!yieldMapByStrain.has(strain)) yieldMapByStrain.set(strain, new Map());
                yieldMapByStrain.get(strain)!.set(
                    `${row.input_type}→${row.output_type}`,
                    { avg: parseFloat(row.avg_yield_pct as string), count: row.sample_count as number },
                );
            }
            // Ensure every referenced strain has an entry (even empty) so lookups don't crash.
            for (const s of strainsReferenced) if (!yieldMapByStrain.has(s)) yieldMapByStrain.set(s, new Map());
        }

        // Chain cache keyed by outputType — same target product means same template chain.
        const chainCache = new Map<string, ChainLink[]>();
        const getChain = (outputType: string): ChainLink[] => {
            const cached = chainCache.get(outputType);
            if (cached) return cached;
            const chain = buildChain(outputType, templates, productTypes, stepsByTemplate, warnings);
            chainCache.set(outputType, chain);
            return chain;
        };

        // ── Resolve each target, build & merge stages ───────────────────
        const resolvedTargets: ResolvedTarget[] = rawTargets.map(t => {
            const pt = productTypes.get(t.outputType);
            return {
                outputType: t.outputType,
                quantity: t.quantity,
                unit: t.unit,
                strain: t.strain || null,
                displayName: pt?.display_name || t.outputType.replace(/_/g, ' '),
                resolvedUnit: t.unit || pt?.default_unit || 'g',
            };
        });

        const stageMap = new Map<string, PlanStage>();
        // Biomass buckets keyed by `${inputType}::${strain || 'any'}`.
        const biomassNeeded = new Map<string, { type: string; strain: string | null; quantity: number; unit: string; displayName: string }>();

        rawTargets.forEach((target, idx) => {
            const chain = getChain(target.outputType);
            if (chain.length === 0) {
                const pt = productTypes.get(target.outputType);
                warnings.push(`No matching SOP for "${pt?.display_name || target.outputType}" — target skipped.`);
                return;
            }
            const targetStages = stagesForTarget(target, idx, chain, productTypes, yieldMapByStrain, overrideMap, warnings);
            for (const stage of targetStages) {
                const existing = stageMap.get(stage.key);
                stageMap.set(stage.key, existing ? mergeStage(existing, stage) : stage);
            }

            // First stage's input is the biomass anchor for this target.
            const firstStage = targetStages[0];
            if (firstStage) {
                const strain = target.strain || null;
                const bkey = `${firstStage.inputType}::${strain || 'any'}`;
                const existing = biomassNeeded.get(bkey);
                if (existing) {
                    existing.quantity = Math.ceil((existing.quantity + firstStage.inputQty) * 100) / 100;
                } else {
                    const pt = productTypes.get(firstStage.inputType);
                    biomassNeeded.set(bkey, {
                        type: firstStage.inputType,
                        strain,
                        quantity: firstStage.inputQty,
                        unit: pt?.default_unit || 'g',
                        displayName: pt?.display_name || firstStage.inputType.replace(/_/g, ' '),
                    });
                }
            }
        });

        // Merged stage list, ordered by template chain position then strain.
        // Use the first contributing target's chain position as the sort key.
        const stages = Array.from(stageMap.values()).sort((a, b) => {
            if (a.templateName !== b.templateName) return a.templateName.localeCompare(b.templateName);
            return (a.strain || '').localeCompare(b.strain || '');
        });

        // ── Biomass inventory lookup per bucket ─────────────────────────
        const biomassRequired: BiomassBucket[] = [];
        const biomassOnHand: BiomassOnHandBucket[] = [];
        const biomassGap: BiomassBucket[] = [];

        for (const bucket of biomassNeeded.values()) {
            const params: unknown[] = [companyId, bucket.type];
            let query = `SELECT id, label, strain, quantity, unit
                         FROM packages
                         WHERE company_id = $1
                           AND package_type = $2
                           AND status = 'active'
                           AND quantity > 0`;
            if (bucket.strain) {
                params.push(bucket.strain);
                query += ` AND strain = $3`;
            }
            query += ` ORDER BY quantity DESC`;
            const pkgRes = await pool.query(query, params);
            const packages = pkgRes.rows.map((p: Record<string, unknown>) => ({
                id: p.id as string,
                label: p.label as string,
                strain: p.strain as string | null,
                quantity: parseFloat(p.quantity as string),
            }));
            const totalOnHand = packages.reduce((sum, p) => sum + p.quantity, 0);
            biomassOnHand.push({
                type: bucket.type,
                strain: bucket.strain,
                quantity: totalOnHand,
                unit: bucket.unit,
                packages,
            });
            const gap = Math.max(0, bucket.quantity - totalOnHand);

            // Supplier suggestions for this bucket. Unit 1 is adding
            // vendor_type/strains_grown/last_contacted_at in a sibling PR; until
            // that lands, this query will raise "column does not exist". Swallow
            // the error so the planner still works in the meantime.
            let suggestedSuppliers: SuggestedSupplier[] = [];
            try {
                const vendorParams: unknown[] = [companyId];
                let vendorQuery = `SELECT id, name, contact_email, last_contacted_at,
                                          (strains_grown IS NOT NULL AND $2::text IS NOT NULL
                                            AND $2::text = ANY(strains_grown)) AS specific_match
                                   FROM vendors
                                   WHERE company_id = $1
                                     AND is_active = TRUE
                                     AND vendor_type IN ('biomass', 'both')`;
                vendorParams.push(bucket.strain);
                if (bucket.strain) {
                    vendorQuery += ` AND ($2::text = ANY(strains_grown) OR strains_grown IS NULL)`;
                }
                vendorQuery += ` ORDER BY specific_match DESC NULLS LAST, last_contacted_at DESC NULLS LAST, name ASC
                                 LIMIT 5`;
                const vendorRes = await pool.query(vendorQuery, vendorParams);
                suggestedSuppliers = vendorRes.rows.map((v: Record<string, unknown>) => ({
                    vendorId: v.id as string,
                    name: v.name as string,
                    contactEmail: (v.contact_email as string | null) ?? null,
                    lastContactedAt: v.last_contacted_at
                        ? new Date(v.last_contacted_at as string).toISOString()
                        : null,
                    isSpecificMatch: bucket.strain ? Boolean(v.specific_match) : false,
                }));
            } catch (err) {
                // Columns not yet migrated. Fall back to empty list.
                console.warn('[plan-backward] supplier suggestion query failed (likely pre-migration):',
                    err instanceof Error ? err.message : err);
            }

            biomassRequired.push({
                type: bucket.type,
                displayName: bucket.displayName,
                strain: bucket.strain,
                quantity: bucket.quantity,
                unit: bucket.unit,
                onHandGrams: Math.round(totalOnHand * 100) / 100,
                shortfallGrams: Math.ceil(gap * 100) / 100,
                suggestedSuppliers,
            });

            if (gap > 0) {
                biomassGap.push({
                    type: bucket.type,
                    displayName: bucket.displayName,
                    strain: bucket.strain,
                    quantity: Math.ceil(gap * 100) / 100,
                    unit: bucket.unit,
                });
            }
        }

        // ── Supplies: per-stage, output-scaled when requested ───────────
        // For each stage in the merged plan, look up the supply requirements
        // of its template's steps. When a requirement is marked scales_with_
        // output, multiply quantity_per by the stage's output qty (so 1000
        // filled carts debit 1000 empty cart bodies). Otherwise treat it as
        // per-template-batch and add it once per stage. The map is keyed on
        // supply item id so identical supplies across stages aggregate.
        const allStepIds = Array.from(new Set(
            stages.flatMap(s => (stepsByTemplate.get(s.templateId) || []).map(step => step.id))
        ));
        let suppliesNeeded: SupplyNeed[] = [];
        if (allStepIds.length > 0) {
            const [supplyResult, equipResult] = await Promise.all([
                pool.query(
                    `SELECT ssr.step_id, ps.template_id, ps.equipment_type,
                            ssr.scales_with_output, ssr.scaling_mode, ssr.quantity_per,
                            si.id AS supply_id, si.name AS supply_name,
                            si.unit AS supply_unit, si.quantity_on_hand
                     FROM step_supply_requirements ssr
                     JOIN process_steps ps ON ps.id = ssr.step_id
                     JOIN supply_items si ON si.id = ssr.supply_item_id
                     WHERE ssr.step_id = ANY($1::uuid[])`,
                    [allStepIds]
                ),
                // Load one equipment piece per type for capacity reference
                pool.query(
                    `SELECT DISTINCT ON (equipment_type) equipment_type, capacity_grams
                     FROM extraction_equipment
                     WHERE company_id = $1 AND status = 'available' AND capacity_grams IS NOT NULL
                     ORDER BY equipment_type, name`,
                    [companyId]
                ),
            ]);
            // Equipment capacity by type for per-cycle calculations
            const equipCapByType = new Map<string, number>();
            for (const row of equipResult.rows as Record<string, unknown>[]) {
                const cap = parseFloat(row.capacity_grams as string);
                if (cap > 0) equipCapByType.set(row.equipment_type as string, cap);
            }

            // Group supply reqs by template_id for per-stage lookup.
            type SupplyReq = {
                supplyId: string;
                name: string;
                unit: string;
                quantityPer: number;
                onHand: number;
                scalingMode: string;
                equipmentType: string | null;
            };
            const reqsByTemplate = new Map<string, SupplyReq[]>();
            for (const row of supplyResult.rows as Record<string, unknown>[]) {
                const tmplId = row.template_id as string;
                const mode = (row.scaling_mode as string) || (row.scales_with_output === true ? 'per_output' : 'fixed');
                const req: SupplyReq = {
                    supplyId: row.supply_id as string,
                    name: row.supply_name as string,
                    unit: row.supply_unit as string,
                    quantityPer: parseFloat(row.quantity_per as string),
                    onHand: parseFloat(row.quantity_on_hand as string),
                    scalingMode: mode,
                    equipmentType: (row.equipment_type as string) || null,
                };
                if (!reqsByTemplate.has(tmplId)) reqsByTemplate.set(tmplId, []);
                reqsByTemplate.get(tmplId)!.push(req);
            }

            const supplyMap = new Map<string, SupplyNeed>();
            for (const stage of stages) {
                const reqs = reqsByTemplate.get(stage.templateId) || [];
                for (const req of reqs) {
                    let quantity: number;
                    if (req.scalingMode === 'per_cycle' && req.equipmentType) {
                        const cap = equipCapByType.get(req.equipmentType);
                        const cycles = cap && cap > 0 ? Math.ceil(stage.inputQty / cap) : 1;
                        quantity = req.quantityPer * cycles;
                    } else if (req.scalingMode === 'per_output') {
                        quantity = req.quantityPer * stage.outputQty;
                    } else {
                        quantity = req.quantityPer;
                    }
                    const existing = supplyMap.get(req.supplyId) || {
                        name: req.name,
                        unit: req.unit,
                        needed: 0,
                        onHand: req.onHand,
                        gap: 0,
                    };
                    existing.needed += quantity;
                    supplyMap.set(req.supplyId, existing);
                }
            }
            suppliesNeeded = Array.from(supplyMap.values()).map(s => ({
                ...s,
                needed: Math.ceil(s.needed * 100) / 100,
                gap: Math.max(0, Math.ceil((s.needed - s.onHand) * 100) / 100),
            }));
        }

        const plan: BackwardPlan = {
            targets: resolvedTargets,
            stages,
            biomassRequired,
            biomassOnHand,
            biomassGap,
            suppliesNeeded,
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
