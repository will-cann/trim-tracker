import { ToolInputError } from './mcpErrors';
import type { McpToolDefinition, ToolHandler } from './mcpTools';

/**
 * Public tools for the NeuroCann LLM plugin — callable without an account.
 *
 * These are the top-of-funnel surface inside ChatGPT / Claude: a grower or
 * extractor can get a real answer (how much fresh frozen for 500 g of rosin,
 * what a harvest will dry down to) before they have ever heard of us, and the
 * response points them at the facility-connected version. They must stay
 * database-free so anonymous traffic costs nothing and cannot leak anything.
 */

const APP_URL = process.env.APP_PUBLIC_URL || 'https://neurocann.app';
const CONTACT_EMAIL = process.env.APP_CONTACT_EMAIL || 'will@neurocann.app';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

// ── Units ─────────────────────────────────────────────────────────────────────

const GRAMS_PER: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
type WeightUnit = keyof typeof GRAMS_PER;

function toGrams(value: number, unit: string): number {
    const factor = GRAMS_PER[unit];
    if (!factor) throw new ToolInputError(`Unknown unit "${unit}" — use g, kg, oz or lb`);
    return value * factor;
}

function round(n: number, dp = 1): number {
    const f = 10 ** dp;
    return Math.round(n * f) / f;
}

function weight(grams: number) {
    return { grams: round(grams), pounds: round(grams / GRAMS_PER.lb, 2) };
}

function positiveNumber(value: unknown, key: string): number {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    if (!Number.isFinite(n) || n <= 0) throw new ToolInputError(`"${key}" must be a positive number`);
    return n;
}

function pct(value: unknown, fallback: number, key: string): number {
    if (value === undefined || value === null || value === '') return fallback;
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    if (!Number.isFinite(n) || n <= 0 || n > 100) throw new ToolInputError(`"${key}" must be a percentage between 0 and 100`);
    return n;
}

// ── Extraction process presets (mirror migrations/seed_extraction_presets.sql) ─

/**
 * `hours` is wall-clock process time for a standard batch; `laborHours` is the
 * attended labor within it (a 24 h freeze-dry cycle needs ~1 h of hands-on).
 */
interface StepPreset { key: string; name: string; from: string; to: string; yieldPct: number; hours: number; laborHours: number }

const SOLVENTLESS: StepPreset[] = [
    { key: 'washYieldPct', name: 'Wash (ice water)', from: 'fresh_frozen', to: 'bubble_hash', yieldPct: 5, hours: 4.5, laborHours: 4.5 },
    { key: 'freezeDryYieldPct', name: 'Freeze dry', from: 'bubble_hash', to: 'bubble_hash', yieldPct: 96, hours: 24, laborHours: 1 },
    { key: 'pressYieldPct', name: 'Press', from: 'bubble_hash', to: 'rosin', yieldPct: 60, hours: 1, laborHours: 1 },
    { key: 'decarbYieldPct', name: 'Decarb', from: 'rosin', to: 'rosin', yieldPct: 95, hours: 2, laborHours: 0.5 },
    { key: 'fillYieldPct', name: 'Fill carts', from: 'rosin', to: 'rosin_cart', yieldPct: 95, hours: 2, laborHours: 2 },
];

const BHO: StepPreset[] = [
    { key: 'extractYieldPct', name: 'Closed-loop extract', from: 'fresh_frozen', to: 'crude_extract', yieldPct: 15, hours: 4, laborHours: 4 },
    { key: 'purgeYieldPct', name: 'Purge / dewax', from: 'crude_extract', to: 'purged_extract', yieldPct: 90, hours: 24, laborHours: 1 },
    { key: 'cureYieldPct', name: 'Pour / cure', from: 'purged_extract', to: 'bho_concentrate', yieldPct: 95, hours: 48, laborHours: 1 },
];

const DISTILLATE: StepPreset[] = [
    { key: 'extractYieldPct', name: 'Closed-loop extract', from: 'trim', to: 'crude_extract', yieldPct: 12, hours: 4, laborHours: 4 },
    { key: 'winterizeYieldPct', name: 'Winterize', from: 'crude_extract', to: 'winterized', yieldPct: 85, hours: 12, laborHours: 1 },
    { key: 'filterYieldPct', name: 'Filter', from: 'winterized', to: 'filtered', yieldPct: 95, hours: 2, laborHours: 2 },
    { key: 'distillYieldPct', name: 'Short-path distill', from: 'filtered', to: 'distillate', yieldPct: 80, hours: 6, laborHours: 6 },
];

interface Target { chain: StepPreset[]; stopAfter: string; input: string; label: string; consumablesUsdPerBatch: number }

const TARGETS: Record<string, Target> = {
    bubble_hash: { chain: SOLVENTLESS, stopAfter: 'freezeDryYieldPct', input: 'fresh_frozen', label: 'bubble hash (freeze-dried)', consumablesUsdPerBatch: 40 },
    rosin: { chain: SOLVENTLESS, stopAfter: 'pressYieldPct', input: 'fresh_frozen', label: 'live rosin', consumablesUsdPerBatch: 60 },
    rosin_carts: { chain: SOLVENTLESS, stopAfter: 'fillYieldPct', input: 'fresh_frozen', label: 'live rosin cartridges', consumablesUsdPerBatch: 60 },
    bho_concentrate: { chain: BHO, stopAfter: 'cureYieldPct', input: 'fresh_frozen', label: 'BHO concentrate', consumablesUsdPerBatch: 250 },
    distillate: { chain: DISTILLATE, stopAfter: 'distillYieldPct', input: 'trim', label: 'distillate', consumablesUsdPerBatch: 300 },
};

const STANDARD_BATCH_G = 500;

/** Planning defaults for the economics tool — always echoed back as assumptions. */
const DEFAULT_MATERIAL_PRICE_PER_LB: Record<string, number> = { fresh_frozen: 150, trim: 40 };
const DEFAULT_LABOR_RATE_USD = 22;
const DEFAULT_LAB_TEST_USD_PER_BATCH = 150;

/** Solventless throughput defaults (wash + freeze-dry capacity planning). */
const DEFAULT_WASH_CAPACITY_LB = 20;
const DEFAULT_WASH_STATIONS = 1;
const DEFAULT_FREEZE_DRYERS = 1;
const DEFAULT_FREEZE_DRYER_CAPACITY_G = 2000; // wet hash per cycle, large consumer/pro unit
const DEFAULT_FREEZE_DRYER_CYCLE_HOURS = 24;

interface PlannedStep extends StepPreset { yieldSource: 'override' | 'neurocann_preset'; inputGrams: number; outputGrams: number }

/** Resolve a target's step chain with overrides applied, then walk back from the finished weight. */
function planBackward(target: Target, outputGrams: number, overrides: Record<string, unknown>): { steps: PlannedStep[]; requiredGrams: number } {
    const stopIdx = target.chain.findIndex(s => s.key === target.stopAfter);
    const chain = target.chain.slice(0, stopIdx + 1);
    let required = outputGrams;
    const steps: PlannedStep[] = [];
    for (let i = chain.length - 1; i >= 0; i--) {
        const s = chain[i];
        const yieldPct = pct(overrides[s.key], s.yieldPct, s.key);
        const input = required / (yieldPct / 100);
        steps.unshift({ ...s, yieldPct, yieldSource: overrides[s.key] !== undefined ? 'override' : 'neurocann_preset', inputGrams: input, outputGrams: required });
        required = input;
    }
    return { steps, requiredGrams: required };
}

function yieldOverrides(args: Record<string, any>): Record<string, unknown> {
    return args.yieldOverridesPct && typeof args.yieldOverridesPct === 'object' ? args.yieldOverridesPct : {};
}

const YIELD_OVERRIDE_SCHEMA = {
    type: 'object',
    description: 'Optional per-step yield overrides as percentages, e.g. {"washYieldPct": 3.5, "pressYieldPct": 70}.',
    properties: {
        washYieldPct: { type: 'number' }, freezeDryYieldPct: { type: 'number' }, pressYieldPct: { type: 'number' },
        decarbYieldPct: { type: 'number' }, fillYieldPct: { type: 'number' }, extractYieldPct: { type: 'number' },
        purgeYieldPct: { type: 'number' }, cureYieldPct: { type: 'number' }, winterizeYieldPct: { type: 'number' },
        filterYieldPct: { type: 'number' }, distillYieldPct: { type: 'number' },
    },
    additionalProperties: false,
};

// ── Cultivation / trim defaults (explicit assumptions, all overridable) ───────

const DEFAULT_FLOWERING_DAYS = 63;   // matches the strains.default_flowering_days seed
const DEFAULT_DRYING_DAYS = 10;
const DEFAULT_CURE_DAYS = 14;
const DEFAULT_DRY_G_PER_PLANT = 450; // indoor, ~1 lb dry per plant
const DEFAULT_FLOWER_SHARE_PCT = 70; // of dry weight → A/B flower; remainder trim + shake
const DEFAULT_SHAKE_SHARE_PCT = 10;
const DEFAULT_HAND_TRIM_G_PER_HR = 75;
const DEFAULT_MACHINE_TRIM_G_PER_HR = 1000;
const DEFAULT_SHIFT_HOURS = 8;

const DAY_MS = 86_400_000;

function parseDate(value: unknown, key: string): Date {
    const d = new Date(String(value));
    if (!value || Number.isNaN(d.getTime())) throw new ToolInputError(`"${key}" must be an ISO date (YYYY-MM-DD)`);
    return d;
}

function addDays(d: Date, days: number): Date {
    return new Date(d.getTime() + days * DAY_MS);
}

function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function nonNegativeInt(value: unknown, fallback: number, key: string): number {
    if (value === undefined || value === null || value === '') return fallback;
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    if (!Number.isFinite(n) || n < 0) throw new ToolInputError(`"${key}" must be zero or a positive number`);
    return Math.round(n);
}

// ── Tools ─────────────────────────────────────────────────────────────────────

type Register = (definition: McpToolDefinition, handler: ToolHandler) => void;

export function registerPublicTools(register: Register) {
    register({
        name: 'about_neurocann',
        title: 'About NeuroCann',
        description: 'Explain what NeuroCann is — a cannabis cultivation and extraction operations platform (plant map, harvest pipeline, trim sessions, extraction planning, packaging/compliance, ordering, tasks) run through a conversational AI — who it is for, and how to connect a facility so the other tools return live data.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        scope: 'public',
        annotations: READ_ONLY,
    }, async () => ({
        name: 'NeuroCann',
        summary: 'Operations platform for licensed cannabis cultivators and extractors. Cultivation, harvest, trim, extraction, packaging, ordering, supplies and compliance run through one conversational interface — voice-first, with every action previewed and confirmed before it hits the database.',
        audience: ['Indoor and outdoor cultivators', 'Solventless and hydrocarbon extraction labs', 'Contract extractors sourcing fresh frozen from outside growers', 'Multi-site operators who need floor accountability'],
        modules: {
            cultivation: 'Room-by-room plant map; move plants, flip phases, flag contamination and health.',
            harvest: 'Plan the cut, live weigh on harvest day, allocate flower vs fresh frozen, hang, bin, hand off to trim.',
            trim: 'Live sessions with assigned trimmers and flower/shake/trim/waste weighed as you go.',
            extraction: 'Templated processes (wash → freeze dry → press → carts), demand-backward planning from finished goods, per-strain historical yields.',
            packaging: 'Finished inventory with lab states, audited adjustments and tag tracking.',
            ordering: 'Multi-store purchase orders from vendor menus and POS velocity; AI-drafted supplier outreach.',
            tasks: 'Work that still needs a human — assignees, due dates, hybrid physical-then-digital completion.',
            reports: 'Ad-hoc analytics on yields, labor productivity and cost per pound.',
        },
        inThisAssistant: {
            withoutAccount: [
                'plan_extraction_inputs — demand-backward input planning using NeuroCann preset yields',
                'estimate_cost_per_gram — extraction economics: batch cost, cost per gram, margin and break-even yield',
                'plan_wash_schedule — wash runs, freeze-dryer cycles, days and bottleneck for a fresh-frozen lot',
                'estimate_dry_weight — wet-to-dry harvest estimates',
                'estimate_harvest_yield — plants or canopy → dry weight and flower/trim/shake split',
                'plan_harvest_timeline — flip date ↔ harvest, dry and cure dates',
                'estimate_trim_labor — trimmer-hours, crew size and labor cost',
            ],
            withLinkedFacility: ['Live plants, rooms, harvests, packages, extraction runs and tasks', 'Reports over your own data (yield by strain, harvest trends, labor)', 'Creating and completing floor tasks'],
            howToLink: 'Link or create a NeuroCann account when this assistant prompts you to sign in; a new sign-in creates a fresh facility workspace automatically.',
        },
        links: {
            website: APP_URL,
            signIn: APP_URL,
            demoRequest: `mailto:${CONTACT_EMAIL}?subject=NeuroCann%20Demo%20Request`,
            privacyPolicy: `${APP_URL}/privacy`,
            termsOfService: `${APP_URL}/terms`,
        },
    }));

    register({
        name: 'plan_extraction_inputs',
        title: 'Plan extraction inputs',
        description: 'Demand-backward extraction planner: given a target amount of finished product (live rosin, bubble hash, rosin carts, BHO concentrate or distillate), work out how much starting material (fresh frozen or trim) is required, the expected weight at every process step, estimated process hours, and material cost if a price is supplied. Uses NeuroCann process-template yield presets by default; any step yield can be overridden. No account required.',
        inputSchema: {
            type: 'object',
            properties: {
                targetProduct: { type: 'string', enum: Object.keys(TARGETS), description: 'Finished product to plan for.' },
                targetAmount: { type: 'number', exclusiveMinimum: 0, description: 'How much finished product you need, in targetUnit.' },
                targetUnit: { type: 'string', enum: ['g', 'kg', 'oz', 'lb', 'carts'], default: 'g', description: '"carts" is only valid for rosin_carts.' },
                gramsPerCart: { type: 'number', exclusiveMinimum: 0, default: 0.5, description: 'Fill weight per cartridge when targetUnit is carts.' },
                pricePerLb: { type: 'number', minimum: 0, description: 'Optional purchase price of the starting material per pound (USD) for a cost estimate.' },
                washVesselCapacityLb: { type: 'number', exclusiveMinimum: 0, description: 'Optional: starting-material capacity of one wash/extraction run, to estimate run count and hours.' },
                yieldOverridesPct: YIELD_OVERRIDE_SCHEMA,
            },
            required: ['targetProduct', 'targetAmount'],
            additionalProperties: false,
        },
        scope: 'public',
        annotations: READ_ONLY,
    }, async (_ctx, args) => {
        const target = TARGETS[String(args.targetProduct)];
        if (!target) throw new ToolInputError(`"targetProduct" must be one of: ${Object.keys(TARGETS).join(', ')}`);

        const amount = positiveNumber(args.targetAmount, 'targetAmount');
        const unit = String(args.targetUnit || 'g');
        let outputGrams: number;
        let cartCount: number | undefined;
        if (unit === 'carts') {
            if (args.targetProduct !== 'rosin_carts') throw new ToolInputError('"carts" is only valid when targetProduct is rosin_carts');
            const perCart = args.gramsPerCart === undefined ? 0.5 : positiveNumber(args.gramsPerCart, 'gramsPerCart');
            cartCount = Math.ceil(amount);
            outputGrams = cartCount * perCart;
        } else {
            outputGrams = toGrams(amount, unit);
        }

        const { steps, requiredGrams: required } = planBackward(target, outputGrams, yieldOverrides(args));
        const plan = steps.map(s => ({
            step: s.name, input: s.from, output: s.to, yieldPct: s.yieldPct, yieldSource: s.yieldSource,
            inputWeight: weight(s.inputGrams), outputWeight: weight(s.outputGrams), estimatedHours: s.hours,
        }));
        const overallYieldPct = round((outputGrams / required) * 100, 2);

        const materialCost = args.pricePerLb !== undefined && args.pricePerLb !== null
            ? round((required / GRAMS_PER.lb) * positiveNumber(args.pricePerLb, 'pricePerLb'), 2)
            : undefined;

        let runs;
        if (args.washVesselCapacityLb !== undefined && args.washVesselCapacityLb !== null) {
            const capacityG = toGrams(positiveNumber(args.washVesselCapacityLb, 'washVesselCapacityLb'), 'lb');
            const count = Math.ceil(required / capacityG);
            runs = { firstStepRuns: count, firstStepHoursTotal: round(count * steps[0].hours, 1), note: 'Cycle time per run is roughly fixed regardless of fill weight.' };
        }

        return {
            target: { product: target.label, ...(cartCount !== undefined ? { carts: cartCount } : {}), finishedWeight: weight(outputGrams) },
            startingMaterial: { type: target.input, required: weight(required) },
            overallYieldPct,
            steps: plan,
            outputBatches: { standardBatchGrams: STANDARD_BATCH_G, batches: Math.ceil(outputGrams / STANDARD_BATCH_G), note: 'Finished output is typically batched in 500 g increments (lab-testing minimum).' },
            ...(materialCost !== undefined ? { estimatedMaterialCostUsd: materialCost } : {}),
            ...(runs ? { runs } : {}),
            assumptions: [
                'Yields are NeuroCann process-template presets unless overridden; real solventless wash yields commonly range 2–6% depending on genetics and freshness.',
                'With a linked NeuroCann facility, the planner uses your own historical per-strain yields and on-hand inventory instead of presets.',
            ],
            next: `Connect a facility at ${APP_URL} to plan against live inventory and historical yields.`,
        };
    });

    register({
        name: 'estimate_cost_per_gram',
        title: 'Estimate cost per gram',
        description: 'Extraction economics: what it costs to produce a gram of live rosin, bubble hash, rosin carts, BHO concentrate or distillate. Builds a batch cost from starting-material price, attended labor, consumables, lab testing and optional packaging, then reports cost per gram (and per unit), the material share of cost, and — if a wholesale price is given — gross margin and the break-even yield. Defaults are stated and every one can be overridden. No account required.',
        inputSchema: {
            type: 'object',
            properties: {
                targetProduct: { type: 'string', enum: Object.keys(TARGETS), description: 'Finished product to cost.' },
                batchOutputGrams: { type: 'number', exclusiveMinimum: 0, default: STANDARD_BATCH_G, description: 'Finished grams per batch to cost against (500 g is the usual lab-test batch).' },
                materialPricePerLb: { type: 'number', minimum: 0, description: `Starting-material price per pound (USD). Defaults: fresh frozen $${DEFAULT_MATERIAL_PRICE_PER_LB.fresh_frozen}/lb, trim $${DEFAULT_MATERIAL_PRICE_PER_LB.trim}/lb.` },
                laborRateUsd: { type: 'number', minimum: 0, default: DEFAULT_LABOR_RATE_USD, description: 'Loaded hourly labor rate.' },
                laborHours: { type: 'number', minimum: 0, description: 'Override attended labor hours per batch; defaults to the sum of NeuroCann preset hands-on hours for the process.' },
                consumablesUsd: { type: 'number', minimum: 0, description: 'Per-batch consumables (bags, filters, parchment, solvent). Defaults by process: solventless $40–60, BHO $250, distillate $300.' },
                labTestUsd: { type: 'number', minimum: 0, default: DEFAULT_LAB_TEST_USD_PER_BATCH, description: 'Compliance lab testing per batch.' },
                overheadUsd: { type: 'number', minimum: 0, default: 0, description: 'Optional per-batch share of rent, utilities, equipment depreciation.' },
                unitGrams: { type: 'number', exclusiveMinimum: 0, description: 'Optional retail unit size (e.g. 1 for gram jars, 0.5 for half-gram carts) for a per-unit cost.' },
                packagingUsdPerUnit: { type: 'number', minimum: 0, description: 'Optional packaging/hardware cost per unit (jar, cart, label).' },
                wholesalePricePerGram: { type: 'number', minimum: 0, description: 'Optional selling price per gram for margin and break-even yield.' },
                yieldOverridesPct: YIELD_OVERRIDE_SCHEMA,
            },
            required: ['targetProduct'],
            additionalProperties: false,
        },
        scope: 'public',
        annotations: READ_ONLY,
    }, async (_ctx, args) => {
        const target = TARGETS[String(args.targetProduct)];
        if (!target) throw new ToolInputError(`"targetProduct" must be one of: ${Object.keys(TARGETS).join(', ')}`);

        const outputGrams = args.batchOutputGrams === undefined ? STANDARD_BATCH_G : positiveNumber(args.batchOutputGrams, 'batchOutputGrams');
        const { steps, requiredGrams } = planBackward(target, outputGrams, yieldOverrides(args));
        const overallYieldPct = (outputGrams / requiredGrams) * 100;

        const optNonNeg = (key: string, fallback: number): { value: number; source: 'input' | 'default' } => {
            if (args[key] === undefined || args[key] === null) return { value: fallback, source: 'default' };
            const n = typeof args[key] === 'number' ? args[key] : parseFloat(String(args[key]));
            if (!Number.isFinite(n) || n < 0) throw new ToolInputError(`"${key}" must be zero or a positive number`);
            return { value: n, source: 'input' };
        };

        const materialPrice = optNonNeg('materialPricePerLb', DEFAULT_MATERIAL_PRICE_PER_LB[target.input] ?? 0);
        const laborRate = optNonNeg('laborRateUsd', DEFAULT_LABOR_RATE_USD);
        const presetLaborHours = steps.reduce((a, s) => a + s.laborHours, 0);
        const laborHours = optNonNeg('laborHours', presetLaborHours);
        const consumables = optNonNeg('consumablesUsd', target.consumablesUsdPerBatch);
        const labTest = optNonNeg('labTestUsd', DEFAULT_LAB_TEST_USD_PER_BATCH);
        const overhead = optNonNeg('overheadUsd', 0);

        const unitGrams = args.unitGrams === undefined || args.unitGrams === null ? undefined : positiveNumber(args.unitGrams, 'unitGrams');
        const units = unitGrams ? Math.floor(outputGrams / unitGrams) : undefined;
        const packagingPerUnit = optNonNeg('packagingUsdPerUnit', 0);

        const materialUsd = (requiredGrams / GRAMS_PER.lb) * materialPrice.value;
        const laborUsd = laborHours.value * laborRate.value;
        const packagingUsd = units ? units * packagingPerUnit.value : 0;
        const fixedUsd = laborUsd + consumables.value + labTest.value + overhead.value + packagingUsd;
        const totalUsd = materialUsd + fixedUsd;
        const costPerGram = totalUsd / outputGrams;

        const breakdown = [
            { item: 'Starting material', usd: round(materialUsd, 2), basis: `${round(requiredGrams / GRAMS_PER.lb, 2)} lb ${target.input.replace(/_/g, ' ')} × $${materialPrice.value}/lb` },
            { item: 'Labor', usd: round(laborUsd, 2), basis: `${round(laborHours.value, 1)} h × $${laborRate.value}/h` },
            { item: 'Consumables', usd: round(consumables.value, 2), basis: 'per batch' },
            { item: 'Lab testing', usd: round(labTest.value, 2), basis: 'per batch' },
            ...(overhead.value > 0 ? [{ item: 'Overhead', usd: round(overhead.value, 2), basis: 'per batch' }] : []),
            ...(packagingUsd > 0 ? [{ item: 'Packaging', usd: round(packagingUsd, 2), basis: `${units} units × $${packagingPerUnit.value}` }] : []),
        ].map(b => ({ ...b, sharePct: round(totalUsd ? (b.usd / totalUsd) * 100 : 0, 1) }));

        let economics: Record<string, unknown> | undefined;
        if (args.wholesalePricePerGram !== undefined && args.wholesalePricePerGram !== null) {
            const price = positiveNumber(args.wholesalePricePerGram, 'wholesalePricePerGram');
            const revenue = price * outputGrams;
            const grossMargin = revenue - totalUsd;
            // Material cost scales inversely with overall yield; everything else is fixed per batch.
            // Solve price·out = material·(y0/y) + fixed for y.
            const denominator = revenue - fixedUsd;
            const breakEvenYieldPct = denominator > 0 ? (materialUsd * overallYieldPct) / denominator : null;
            const maxMaterialPricePerLb = denominator > 0 ? denominator / (requiredGrams / GRAMS_PER.lb) : 0;
            economics = {
                wholesalePricePerGram: price,
                batchRevenueUsd: round(revenue, 2),
                grossMarginUsd: round(grossMargin, 2),
                grossMarginPct: round(revenue ? (grossMargin / revenue) * 100 : 0, 1),
                breakEvenOverallYieldPct: breakEvenYieldPct === null ? null : round(breakEvenYieldPct, 2),
                maxMaterialPricePerLbAtBreakEven: round(maxMaterialPricePerLb, 2),
            };
        }

        const defaultsUsed = [materialPrice, laborRate, laborHours, consumables, labTest]
            .map((v, i) => (v.source === 'default' ? ['material price', 'labor rate', 'labor hours', 'consumables', 'lab testing'][i] : null))
            .filter(Boolean);

        return {
            product: target.label,
            batch: { outputWeight: weight(outputGrams), startingMaterial: { type: target.input, required: weight(requiredGrams) }, overallYieldPct: round(overallYieldPct, 2), ...(units ? { units, unitGrams } : {}) },
            costPerGramUsd: round(costPerGram, 2),
            ...(units ? { costPerUnitUsd: round(totalUsd / units, 2) } : {}),
            batchCostUsd: round(totalUsd, 2),
            breakdown,
            materialSharePct: round(totalUsd ? (materialUsd / totalUsd) * 100 : 0, 1),
            sensitivity: {
                note: 'Cost per gram if the first (highest-leverage) step yield moves by one percentage point.',
                firstStep: steps[0].name,
                costPerGramAtMinusOnePoint: round(((materialUsd * steps[0].yieldPct) / Math.max(0.1, steps[0].yieldPct - 1) + fixedUsd) / outputGrams, 2),
                costPerGramAtPlusOnePoint: round(((materialUsd * steps[0].yieldPct) / (steps[0].yieldPct + 1) + fixedUsd) / outputGrams, 2),
            },
            ...(economics ? { economics } : {}),
            assumptions: [
                defaultsUsed.length
                    ? `Planning defaults used for ${defaultsUsed.join(', ')} (fresh frozen $${DEFAULT_MATERIAL_PRICE_PER_LB.fresh_frozen}/lb, trim $${DEFAULT_MATERIAL_PRICE_PER_LB.trim}/lb, $${DEFAULT_LABOR_RATE_USD}/h, ${round(presetLaborHours, 1)} attended hours, $${target.consumablesUsdPerBatch} consumables, $${DEFAULT_LAB_TEST_USD_PER_BATCH} lab test) — pass your own numbers to tighten this.`
                    : 'All cost inputs were supplied; yields are NeuroCann presets unless overridden.',
                'Material is usually the dominant cost in solventless, so wash yield and fresh-frozen price move cost per gram far more than labor does.',
                'With a linked NeuroCann facility, runs record actual input weights, yields and labor so cost per gram comes from your own batches.',
            ],
        };
    });

    register({
        name: 'plan_wash_schedule',
        title: 'Plan wash & freeze-dry schedule',
        description: 'Solventless throughput planner: given a quantity of fresh frozen to process, work out wash runs, freeze-dryer cycles, how many days each stage takes with the stations and dryers available, which stage is the bottleneck, the expected wet and dry hash output, and (optionally) finish dates and the equipment needed to hit a deadline. No account required.',
        inputSchema: {
            type: 'object',
            properties: {
                freshFrozenWeight: { type: 'number', exclusiveMinimum: 0 },
                unit: { type: 'string', enum: ['g', 'kg', 'oz', 'lb'], default: 'lb' },
                washCapacityLb: { type: 'number', exclusiveMinimum: 0, default: DEFAULT_WASH_CAPACITY_LB, description: 'Fresh frozen per wash run.' },
                washCycleHours: { type: 'number', exclusiveMinimum: 0, default: 4.5, description: 'Wall-clock time per wash run including collection and cleanup.' },
                washStations: { type: 'integer', minimum: 1, default: DEFAULT_WASH_STATIONS },
                shiftHours: { type: 'number', exclusiveMinimum: 0, default: DEFAULT_SHIFT_HOURS, description: 'Hours per day the wash team works.' },
                washYieldPct: { type: 'number', exclusiveMinimum: 0, maximum: 100, default: 5, description: 'Wet hash yield from fresh frozen.' },
                freezeDryers: { type: 'integer', minimum: 1, default: DEFAULT_FREEZE_DRYERS },
                freezeDryerCapacityG: { type: 'number', exclusiveMinimum: 0, default: DEFAULT_FREEZE_DRYER_CAPACITY_G, description: 'Wet hash per freeze-dryer cycle.' },
                freezeDryerCycleHours: { type: 'number', exclusiveMinimum: 0, default: DEFAULT_FREEZE_DRYER_CYCLE_HOURS },
                startDate: { type: 'string', format: 'date', description: 'Optional: first wash day, to report finish dates.' },
                targetDays: { type: 'number', exclusiveMinimum: 0, description: 'Optional deadline in days; returns the stations and dryers needed to meet it.' },
            },
            required: ['freshFrozenWeight'],
            additionalProperties: false,
        },
        scope: 'public',
        annotations: READ_ONLY,
    }, async (_ctx, args) => {
        const totalG = toGrams(positiveNumber(args.freshFrozenWeight, 'freshFrozenWeight'), String(args.unit || 'lb'));
        const capG = toGrams(args.washCapacityLb === undefined ? DEFAULT_WASH_CAPACITY_LB : positiveNumber(args.washCapacityLb, 'washCapacityLb'), 'lb');
        const washCycle = args.washCycleHours === undefined ? SOLVENTLESS[0].hours : positiveNumber(args.washCycleHours, 'washCycleHours');
        const stations = args.washStations === undefined ? DEFAULT_WASH_STATIONS : Math.max(1, Math.floor(positiveNumber(args.washStations, 'washStations')));
        const shift = args.shiftHours === undefined ? DEFAULT_SHIFT_HOURS : positiveNumber(args.shiftHours, 'shiftHours');
        const washYield = pct(args.washYieldPct, SOLVENTLESS[0].yieldPct, 'washYieldPct');
        const dryers = args.freezeDryers === undefined ? DEFAULT_FREEZE_DRYERS : Math.max(1, Math.floor(positiveNumber(args.freezeDryers, 'freezeDryers')));
        const fdCapG = args.freezeDryerCapacityG === undefined ? DEFAULT_FREEZE_DRYER_CAPACITY_G : positiveNumber(args.freezeDryerCapacityG, 'freezeDryerCapacityG');
        const fdCycle = args.freezeDryerCycleHours === undefined ? DEFAULT_FREEZE_DRYER_CYCLE_HOURS : positiveNumber(args.freezeDryerCycleHours, 'freezeDryerCycleHours');

        const washRuns = Math.ceil(totalG / capG);
        const runsPerStationPerDay = Math.max(1, Math.floor(shift / washCycle));
        const washDays = Math.ceil(washRuns / (runsPerStationPerDay * stations));

        const wetHashG = totalG * (washYield / 100);
        const dryHashG = wetHashG * (SOLVENTLESS[1].yieldPct / 100);
        const fdCycles = Math.ceil(wetHashG / fdCapG);
        const cyclesPerDryerPerDay = Math.max(1, Math.floor(24 / fdCycle));
        const fdDays = Math.ceil(fdCycles / (cyclesPerDryerPerDay * dryers));

        // Drying trails washing by one day (the first cycle loads after the first wash day).
        const elapsedDays = Math.max(washDays, fdDays) + 1;
        const bottleneck = fdDays > washDays ? 'freeze_dry' : washDays > fdDays ? 'wash' : 'balanced';

        let dates: Record<string, string> | undefined;
        if (args.startDate) {
            const start = parseDate(args.startDate, 'startDate');
            dates = { firstWash: isoDate(start), lastWash: isoDate(addDays(start, washDays - 1)), lastFreezeDryComplete: isoDate(addDays(start, elapsedDays)) };
        }

        let toMeetDeadline: Record<string, unknown> | undefined;
        if (args.targetDays !== undefined && args.targetDays !== null) {
            const days = Math.max(1, Math.floor(positiveNumber(args.targetDays, 'targetDays')));
            const stageDays = Math.max(1, days - 1);
            toMeetDeadline = {
                targetDays: days,
                washStationsNeeded: Math.ceil(washRuns / (runsPerStationPerDay * stageDays)),
                freezeDryersNeeded: Math.ceil(fdCycles / (cyclesPerDryerPerDay * stageDays)),
                achievableWithCurrentEquipment: elapsedDays <= days,
            };
        }

        return {
            input: { freshFrozen: weight(totalG) },
            wash: { runs: washRuns, capacityPerRun: weight(capG), runsPerStationPerDay, stations, cycleHours: washCycle, days: washDays, lastRunFillPct: round(((totalG - capG * (washRuns - 1)) / capG) * 100, 0) },
            freezeDry: { cycles: fdCycles, capacityPerCycle: weight(fdCapG), cyclesPerDryerPerDay, dryers, cycleHours: fdCycle, days: fdDays },
            output: { wetHash: weight(wetHashG), dryHash: weight(dryHashG), washYieldPct: washYield, freezeDryYieldPct: SOLVENTLESS[1].yieldPct },
            elapsedDays,
            bottleneck,
            ...(dates ? { dates } : {}),
            ...(toMeetDeadline ? { toMeetDeadline } : {}),
            assumptions: [
                `${DEFAULT_WASH_CAPACITY_LB} lb per wash, ${SOLVENTLESS[0].hours} h per run, ${DEFAULT_FREEZE_DRYER_CAPACITY_G} g wet hash per ${DEFAULT_FREEZE_DRYER_CYCLE_HOURS} h freeze-dry cycle and a ${SOLVENTLESS[0].yieldPct}% wash yield are planning defaults unless you passed your own.`,
                'Freeze-dry capacity is the usual bottleneck: one dryer cycle per day caps throughput at roughly capacity ÷ wash yield pounds of fresh frozen per day.',
                'With a linked NeuroCann facility, runs are scheduled against your actual equipment and the wash yield comes from your own history per strain.',
            ],
        };
    });

    register({
        name: 'estimate_dry_weight',
        title: 'Estimate dry weight',
        description: 'Estimate what a cannabis harvest will weigh after drying from its wet (fresh-cut) weight, using a moisture-loss percentage (default 75%, i.e. ~25% of wet weight remains). Optionally reports per-plant averages and the amount expected to go to fresh frozen vs. dry. No account required.',
        inputSchema: {
            type: 'object',
            properties: {
                wetWeight: { type: 'number', exclusiveMinimum: 0 },
                unit: { type: 'string', enum: ['g', 'kg', 'oz', 'lb'], default: 'g' },
                moistureLossPct: { type: 'number', exclusiveMinimum: 0, maximum: 99, default: 75, description: 'Percent of wet weight lost during drying.' },
                plantCount: { type: 'integer', minimum: 1, description: 'Optional: number of plants, for per-plant averages.' },
                freshFrozenPct: { type: 'number', minimum: 0, maximum: 100, default: 0, description: 'Optional: percent of the wet weight diverted to fresh frozen (not dried).' },
            },
            required: ['wetWeight'],
            additionalProperties: false,
        },
        scope: 'public',
        annotations: READ_ONLY,
    }, async (_ctx, args) => {
        const wetG = toGrams(positiveNumber(args.wetWeight, 'wetWeight'), String(args.unit || 'g') as WeightUnit);
        const loss = pct(args.moistureLossPct, 75, 'moistureLossPct');
        const ffPct = args.freshFrozenPct === undefined ? 0 : pct(args.freshFrozenPct, 0, 'freshFrozenPct');
        const freshFrozenG = wetG * (ffPct / 100);
        const toDryG = wetG - freshFrozenG;
        const dryG = toDryG * (1 - loss / 100);

        const plants = args.plantCount !== undefined ? Math.max(1, Math.floor(positiveNumber(args.plantCount, 'plantCount'))) : undefined;

        return {
            wetWeight: weight(wetG),
            moistureLossPct: loss,
            ...(ffPct > 0 ? { freshFrozen: weight(freshFrozenG), wetWeightDried: weight(toDryG) } : {}),
            estimatedDryWeight: weight(dryG),
            ...(plants ? { perPlant: { plants, wet: weight(wetG / plants), dry: weight(dryG / plants) } } : {}),
            assumptions: [
                `${loss}% moisture loss is NeuroCann's default; dense indoor flower often lands 72–78%, and the estimate is before trim/shake separation.`,
                'With a linked facility, harvests track actual wet, dry and waste weights and the moisture loss per harvest is configurable.',
            ],
        };
    });

    register({
        name: 'plan_harvest_timeline',
        title: 'Plan harvest timeline',
        description: 'Work out a cultivation calendar from either a flip-to-flower date or a target harvest date: when to flip, when to cut, when drying finishes, when cure finishes, and when flower is ready to sell. Accepts the strain\'s flowering days (default 63) plus optional veg, drying and cure durations. No account required.',
        inputSchema: {
            type: 'object',
            properties: {
                flipDate: { type: 'string', format: 'date', description: 'Date plants are switched to 12/12. Provide this or targetHarvestDate.' },
                targetHarvestDate: { type: 'string', format: 'date', description: 'Date you want to cut; the tool back-calculates the flip date.' },
                floweringDays: { type: 'integer', minimum: 35, maximum: 120, default: DEFAULT_FLOWERING_DAYS },
                vegDays: { type: 'integer', minimum: 0, description: 'Optional: days in veg before the flip, to report the transplant/clone date.' },
                dryingDays: { type: 'integer', minimum: 0, default: DEFAULT_DRYING_DAYS },
                cureDays: { type: 'integer', minimum: 0, default: DEFAULT_CURE_DAYS },
            },
            additionalProperties: false,
        },
        scope: 'public',
        annotations: READ_ONLY,
    }, async (_ctx, args) => {
        const floweringDays = nonNegativeInt(args.floweringDays, DEFAULT_FLOWERING_DAYS, 'floweringDays');
        if (floweringDays < 35 || floweringDays > 120) throw new ToolInputError('"floweringDays" must be between 35 and 120');
        const dryingDays = nonNegativeInt(args.dryingDays, DEFAULT_DRYING_DAYS, 'dryingDays');
        const cureDays = nonNegativeInt(args.cureDays, DEFAULT_CURE_DAYS, 'cureDays');
        const vegDays = args.vegDays === undefined ? undefined : nonNegativeInt(args.vegDays, 0, 'vegDays');

        let flip: Date;
        if (args.flipDate) flip = parseDate(args.flipDate, 'flipDate');
        else if (args.targetHarvestDate) flip = addDays(parseDate(args.targetHarvestDate, 'targetHarvestDate'), -floweringDays);
        else throw new ToolInputError('Provide either "flipDate" or "targetHarvestDate"');

        const harvest = addDays(flip, floweringDays);
        const dryDone = addDays(harvest, dryingDays);
        const cureDone = addDays(dryDone, cureDays);

        return {
            milestones: {
                ...(vegDays !== undefined ? { vegStart: isoDate(addDays(flip, -vegDays)) } : {}),
                flipToFlower: isoDate(flip),
                harvest: isoDate(harvest),
                dryingComplete: isoDate(dryDone),
                cureComplete: isoDate(cureDone),
            },
            durations: { ...(vegDays !== undefined ? { vegDays } : {}), floweringDays, dryingDays, cureDays, flipToSaleableDays: floweringDays + dryingDays + cureDays },
            weeklyCheckpoints: [
                { week: 1, note: 'Stretch begins; final defoliation and trellis before week 3.' },
                { week: 3, note: 'Stretch ends; last IPM application before flower sets.' },
                { week: Math.max(4, Math.round(floweringDays / 7) - 2), note: 'Begin checking trichomes; schedule harvest crew and drying room.' },
                { week: Math.round(floweringDays / 7), note: 'Harvest window; book trim capacity for ~10 days later.' },
            ],
            assumptions: [
                `Flowering ${floweringDays} days is a per-strain setting in NeuroCann (default ${DEFAULT_FLOWERING_DAYS}); indica-leaning cuts often finish 56–63, sativa-leaning 70–84.`,
                'With a linked facility, flipping a room records the flower date on each plant and the target harvest date is tracked per batch.',
            ],
        };
    });

    register({
        name: 'estimate_harvest_yield',
        title: 'Estimate harvest yield',
        description: 'Estimate dry yield for a harvest from plant count (or canopy square footage) and an expected dry grams-per-plant, then split it into flower, trim and shake. Reports the wet weight you should expect to see on harvest day too. No account required.',
        inputSchema: {
            type: 'object',
            properties: {
                plantCount: { type: 'integer', minimum: 1, description: 'Number of plants. Provide this or canopySqFt.' },
                canopySqFt: { type: 'number', exclusiveMinimum: 0, description: 'Flowering canopy area; combined with plantsPerSqFt to derive plant count.' },
                plantsPerSqFt: { type: 'number', exclusiveMinimum: 0, default: 1, description: 'Planting density when using canopySqFt.' },
                dryGramsPerPlant: { type: 'number', exclusiveMinimum: 0, default: DEFAULT_DRY_G_PER_PLANT },
                moistureLossPct: { type: 'number', exclusiveMinimum: 0, maximum: 99, default: 75, description: 'Used to back-calculate expected wet weight.' },
                flowerSharePct: { type: 'number', minimum: 0, maximum: 100, default: DEFAULT_FLOWER_SHARE_PCT, description: 'Share of dry weight that grades as flower.' },
                shakeSharePct: { type: 'number', minimum: 0, maximum: 100, default: DEFAULT_SHAKE_SHARE_PCT, description: 'Share of dry weight that ends up as shake; the remainder is trim.' },
                pricePerLbFlower: { type: 'number', minimum: 0, description: 'Optional wholesale price per pound of flower for a revenue estimate.' },
                pricePerLbTrim: { type: 'number', minimum: 0, description: 'Optional wholesale price per pound of trim/shake.' },
            },
            additionalProperties: false,
        },
        scope: 'public',
        annotations: READ_ONLY,
    }, async (_ctx, args) => {
        let plants: number;
        if (args.plantCount !== undefined && args.plantCount !== null) {
            plants = Math.max(1, Math.floor(positiveNumber(args.plantCount, 'plantCount')));
        } else if (args.canopySqFt !== undefined && args.canopySqFt !== null) {
            const density = args.plantsPerSqFt === undefined ? 1 : positiveNumber(args.plantsPerSqFt, 'plantsPerSqFt');
            plants = Math.max(1, Math.round(positiveNumber(args.canopySqFt, 'canopySqFt') * density));
        } else {
            throw new ToolInputError('Provide either "plantCount" or "canopySqFt"');
        }

        const perPlant = args.dryGramsPerPlant === undefined ? DEFAULT_DRY_G_PER_PLANT : positiveNumber(args.dryGramsPerPlant, 'dryGramsPerPlant');
        const loss = pct(args.moistureLossPct, 75, 'moistureLossPct');
        const flowerPct = args.flowerSharePct === undefined ? DEFAULT_FLOWER_SHARE_PCT : pct(args.flowerSharePct, DEFAULT_FLOWER_SHARE_PCT, 'flowerSharePct');
        const shakePct = args.shakeSharePct === undefined ? DEFAULT_SHAKE_SHARE_PCT : pct(args.shakeSharePct, DEFAULT_SHAKE_SHARE_PCT, 'shakeSharePct');
        if (flowerPct + shakePct > 100) throw new ToolInputError('"flowerSharePct" plus "shakeSharePct" cannot exceed 100');

        const dryG = plants * perPlant;
        const wetG = dryG / (1 - loss / 100);
        const flowerG = dryG * (flowerPct / 100);
        const shakeG = dryG * (shakePct / 100);
        const trimG = dryG - flowerG - shakeG;

        const revenue: Record<string, number> = {};
        if (args.pricePerLbFlower !== undefined && args.pricePerLbFlower !== null) {
            revenue.flowerUsd = round((flowerG / GRAMS_PER.lb) * positiveNumber(args.pricePerLbFlower, 'pricePerLbFlower'), 2);
        }
        if (args.pricePerLbTrim !== undefined && args.pricePerLbTrim !== null) {
            revenue.trimAndShakeUsd = round(((trimG + shakeG) / GRAMS_PER.lb) * positiveNumber(args.pricePerLbTrim, 'pricePerLbTrim'), 2);
        }
        if (Object.keys(revenue).length) revenue.totalUsd = round(Object.values(revenue).reduce((a, b) => a + b, 0), 2);

        return {
            plants,
            expectedWetWeight: weight(wetG),
            expectedDryWeight: weight(dryG),
            split: {
                flower: { ...weight(flowerG), sharePct: flowerPct },
                trim: { ...weight(trimG), sharePct: round(100 - flowerPct - shakePct, 1) },
                shake: { ...weight(shakeG), sharePct: shakePct },
            },
            ...(Object.keys(revenue).length ? { estimatedRevenue: revenue } : {}),
            assumptions: [
                `${perPlant} g dry per plant and a ${flowerPct}/${round(100 - flowerPct - shakePct, 1)}/${shakePct} flower/trim/shake split are planning defaults — pass your own numbers for anything but a first estimate.`,
                'With a linked facility, NeuroCann reports actual flower/trim/shake/waste per harvest and per strain from trim sessions.',
            ],
        };
    });

    register({
        name: 'estimate_trim_labor',
        title: 'Estimate trim labor',
        description: 'Estimate trimmer-hours, crew size and labor cost to trim a given dry weight, by hand or machine, at a chosen throughput (grams per trimmer-hour). Answers "how many trimmers do I need to finish this harvest in N days?" No account required.',
        inputSchema: {
            type: 'object',
            properties: {
                dryWeight: { type: 'number', exclusiveMinimum: 0 },
                unit: { type: 'string', enum: ['g', 'kg', 'oz', 'lb'], default: 'lb' },
                method: { type: 'string', enum: ['hand', 'machine'], default: 'hand' },
                gramsPerTrimmerHour: { type: 'number', exclusiveMinimum: 0, description: `Override throughput. Defaults: hand ${DEFAULT_HAND_TRIM_G_PER_HR} g/hr, machine ${DEFAULT_MACHINE_TRIM_G_PER_HR} g/hr (operator + QC).` },
                targetDays: { type: 'number', exclusiveMinimum: 0, description: 'Optional: days available to finish; returns the crew size needed.' },
                crewSize: { type: 'integer', minimum: 1, description: 'Optional: trimmers available; returns days needed.' },
                shiftHours: { type: 'number', exclusiveMinimum: 0, default: DEFAULT_SHIFT_HOURS },
                hourlyRateUsd: { type: 'number', minimum: 0, description: 'Optional loaded labor rate for a cost estimate.' },
            },
            required: ['dryWeight'],
            additionalProperties: false,
        },
        scope: 'public',
        annotations: READ_ONLY,
    }, async (_ctx, args) => {
        const dryG = toGrams(positiveNumber(args.dryWeight, 'dryWeight'), String(args.unit || 'lb'));
        const method = args.method === 'machine' ? 'machine' : 'hand';
        const defaultRate = method === 'machine' ? DEFAULT_MACHINE_TRIM_G_PER_HR : DEFAULT_HAND_TRIM_G_PER_HR;
        const rate = args.gramsPerTrimmerHour === undefined ? defaultRate : positiveNumber(args.gramsPerTrimmerHour, 'gramsPerTrimmerHour');
        const shift = args.shiftHours === undefined ? DEFAULT_SHIFT_HOURS : positiveNumber(args.shiftHours, 'shiftHours');

        const trimmerHours = dryG / rate;
        const result: Record<string, unknown> = {
            dryWeight: weight(dryG),
            method,
            gramsPerTrimmerHour: rate,
            trimmerHours: round(trimmerHours, 1),
            trimmerShifts: round(trimmerHours / shift, 1),
        };

        if (args.targetDays !== undefined && args.targetDays !== null) {
            const days = positiveNumber(args.targetDays, 'targetDays');
            result.crewNeeded = { targetDays: days, trimmers: Math.ceil(trimmerHours / (days * shift)) };
        }
        if (args.crewSize !== undefined && args.crewSize !== null) {
            const crew = Math.max(1, Math.floor(positiveNumber(args.crewSize, 'crewSize')));
            result.daysNeeded = { crewSize: crew, days: round(trimmerHours / (crew * shift), 1) };
        }
        if (args.hourlyRateUsd !== undefined && args.hourlyRateUsd !== null) {
            const hourly = positiveNumber(args.hourlyRateUsd, 'hourlyRateUsd');
            result.laborCost = { totalUsd: round(trimmerHours * hourly, 2), perLbUsd: round((trimmerHours * hourly) / (dryG / GRAMS_PER.lb), 2) };
        }

        result.assumptions = [
            `${rate} g per trimmer-hour is a planning default for ${method} trimming; real crews range widely with bud structure and trim standard.`,
            'With a linked facility, NeuroCann reports measured grams-per-hour per trimmer from live trim sessions, so these estimates become your own numbers.',
        ];
        return result;
    });
}
