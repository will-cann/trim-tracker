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

interface StepPreset { key: string; name: string; from: string; to: string; yieldPct: number; hours: number }

const SOLVENTLESS: StepPreset[] = [
    { key: 'washYieldPct', name: 'Wash (ice water)', from: 'fresh_frozen', to: 'bubble_hash', yieldPct: 5, hours: 4.5 },
    { key: 'freezeDryYieldPct', name: 'Freeze dry', from: 'bubble_hash', to: 'bubble_hash', yieldPct: 96, hours: 24 },
    { key: 'pressYieldPct', name: 'Press', from: 'bubble_hash', to: 'rosin', yieldPct: 60, hours: 1 },
    { key: 'decarbYieldPct', name: 'Decarb', from: 'rosin', to: 'rosin', yieldPct: 95, hours: 2 },
    { key: 'fillYieldPct', name: 'Fill carts', from: 'rosin', to: 'rosin_cart', yieldPct: 95, hours: 2 },
];

const BHO: StepPreset[] = [
    { key: 'extractYieldPct', name: 'Closed-loop extract', from: 'fresh_frozen', to: 'crude_extract', yieldPct: 15, hours: 4 },
    { key: 'purgeYieldPct', name: 'Purge / dewax', from: 'crude_extract', to: 'purged_extract', yieldPct: 90, hours: 24 },
    { key: 'cureYieldPct', name: 'Pour / cure', from: 'purged_extract', to: 'bho_concentrate', yieldPct: 95, hours: 48 },
];

const DISTILLATE: StepPreset[] = [
    { key: 'extractYieldPct', name: 'Closed-loop extract', from: 'trim', to: 'crude_extract', yieldPct: 12, hours: 4 },
    { key: 'winterizeYieldPct', name: 'Winterize', from: 'crude_extract', to: 'winterized', yieldPct: 85, hours: 12 },
    { key: 'filterYieldPct', name: 'Filter', from: 'winterized', to: 'filtered', yieldPct: 95, hours: 2 },
    { key: 'distillYieldPct', name: 'Short-path distill', from: 'filtered', to: 'distillate', yieldPct: 80, hours: 6 },
];

const TARGETS: Record<string, { chain: StepPreset[]; stopAfter: string; input: string; label: string }> = {
    bubble_hash: { chain: SOLVENTLESS, stopAfter: 'freezeDryYieldPct', input: 'fresh_frozen', label: 'bubble hash (freeze-dried)' },
    rosin: { chain: SOLVENTLESS, stopAfter: 'pressYieldPct', input: 'fresh_frozen', label: 'live rosin' },
    rosin_carts: { chain: SOLVENTLESS, stopAfter: 'fillYieldPct', input: 'fresh_frozen', label: 'live rosin cartridges' },
    bho_concentrate: { chain: BHO, stopAfter: 'cureYieldPct', input: 'fresh_frozen', label: 'BHO concentrate' },
    distillate: { chain: DISTILLATE, stopAfter: 'distillYieldPct', input: 'trim', label: 'distillate' },
};

const STANDARD_BATCH_G = 500;

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
            withoutAccount: ['plan_extraction_inputs — demand-backward input planning using NeuroCann preset yields', 'estimate_dry_weight — wet-to-dry harvest estimates'],
            withLinkedFacility: ['Live plants, rooms, harvests, packages, extraction runs and tasks', 'Reports over your own data (yield by strain, harvest trends, labor)', 'Creating and completing floor tasks'],
            howToLink: 'Link or create a NeuroCann account when this assistant prompts you to sign in; a new sign-in creates a fresh facility workspace automatically.',
        },
        links: { website: APP_URL, signIn: APP_URL, demoRequest: `mailto:${CONTACT_EMAIL}?subject=NeuroCann%20Demo%20Request` },
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
                yieldOverridesPct: {
                    type: 'object',
                    description: 'Optional per-step yield overrides as percentages, e.g. {"washYieldPct": 3.5, "pressYieldPct": 70}.',
                    properties: {
                        washYieldPct: { type: 'number' }, freezeDryYieldPct: { type: 'number' }, pressYieldPct: { type: 'number' },
                        decarbYieldPct: { type: 'number' }, fillYieldPct: { type: 'number' }, extractYieldPct: { type: 'number' },
                        purgeYieldPct: { type: 'number' }, cureYieldPct: { type: 'number' }, winterizeYieldPct: { type: 'number' },
                        filterYieldPct: { type: 'number' }, distillYieldPct: { type: 'number' },
                    },
                    additionalProperties: false,
                },
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

        const overrides = (args.yieldOverridesPct && typeof args.yieldOverridesPct === 'object') ? args.yieldOverridesPct : {};
        const stopIdx = target.chain.findIndex(s => s.key === target.stopAfter);
        const steps = target.chain.slice(0, stopIdx + 1).map(s => ({ ...s, yieldPct: pct(overrides[s.key], s.yieldPct, s.key) }));

        // Walk backwards from the finished weight to the starting material.
        let required = outputGrams;
        const plan = [];
        for (let i = steps.length - 1; i >= 0; i--) {
            const s = steps[i];
            const input = required / (s.yieldPct / 100);
            plan.unshift({ step: s.name, input: s.from, output: s.to, yieldPct: s.yieldPct, yieldSource: overrides[s.key] !== undefined ? 'override' : 'neurocann_preset', inputWeight: weight(input), outputWeight: weight(required), estimatedHours: s.hours });
            required = input;
        }
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
}
