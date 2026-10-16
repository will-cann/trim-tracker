import type { T3Mode } from '../../../shared/manifest/t3';

/**
 * Thin client for the T3 API (Track & Trace Tools, https://api.trackandtrace.tools),
 * which wraps metrc.com with a REST interface. Authenticates with a long-lived
 * secret key (T3_API_KEY) generated at https://api.trackandtrace.tools/v2/pages/secret-key
 * against the Metrc login that owns the facility licences.
 *
 * T3 has no scoped keys: a secret key carries every permission of the Metrc
 * login behind it. T3_MODE is how this deploy limits what that key is used for:
 *   read-only (default) — reads + dry-run validation only; submit is refused here
 *   sandbox             — the key is swapped for a Metrc sandbox JWT on each call
 *   live                — real writes when a caller passes submit=true
 *
 * Every data endpoint is scoped by `licenseNumber`. Mutations are dry runs unless
 * `submit=true` is passed, so callers decide explicitly when Metrc is written to.
 */

const T3_BASE_URL = process.env.T3_API_URL || 'https://api.trackandtrace.tools';
const PAGE_SIZE = 500;
/** Metrc labels are 24 chars; ~40 OR'd label filters keeps URLs well under 8 KB. */
const LABEL_FILTER_CHUNK = 40;

export type QueryValue = string | number | boolean | undefined | null | Array<string | number>;
export type Query = Record<string, QueryValue>;

export class T3Error extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly code?: string,
        public readonly detail?: string,
    ) {
        super(message);
        this.name = 'T3Error';
    }
}

export function isT3Configured(): boolean {
    return Boolean(process.env.T3_API_KEY);
}

export function t3Mode(): T3Mode {
    const raw = (process.env.T3_MODE || 'read-only').trim().toLowerCase();
    if (raw === 'live' || raw === 'sandbox') return raw;
    return 'read-only';
}

export const t3WritesAllowed = () => t3Mode() !== 'read-only';

function buildUrl(path: string, query?: Query): string {
    const url = new URL(path, T3_BASE_URL);
    for (const [key, value] of Object.entries(query ?? {})) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
            for (const v of value) url.searchParams.append(key, String(v));
        } else {
            url.searchParams.set(key, String(value));
        }
    }
    return url.toString();
}

/** T3 errors are RFC 7807-ish: { code, title, detail, status }. */
function describeError(status: number, body: unknown): T3Error {
    const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const code = typeof o.code === 'string' ? o.code : undefined;
    const detail = typeof o.detail === 'string' ? o.detail : typeof o.message === 'string' ? o.message : undefined;
    const title = typeof o.title === 'string' ? o.title : undefined;

    let message: string;
    if (status === 401) message = 'T3 rejected the secret key. Regenerate it at api.trackandtrace.tools/v2/pages/secret-key and update T3_API_KEY.';
    else if (status === 402 || /t3\+|subscription/i.test(`${code} ${title} ${detail}`)) message = 'This T3 account needs an active T3+ subscription for Metrc data and transfer endpoints.';
    else if (status === 403) message = detail ?? 'The Metrc login behind the T3 key does not have access to that licence or action.';
    else if (status === 400) message = detail ?? title ?? 'T3 rejected the request.';
    else if (status >= 500) message = 'T3 or Metrc is having trouble right now. Try again in a moment.';
    else message = detail ?? title ?? `T3 request failed (${status}).`;
    return new T3Error(message, status, code, detail);
}

async function parseBody(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return { detail: text.slice(0, 300) };
    }
}

async function rawFetch(url: string, init: RequestInit): Promise<Response> {
    try {
        return await fetch(url, init);
    } catch (err) {
        throw new T3Error(`Could not reach T3: ${err instanceof Error ? err.message : String(err)}`, 502, 'UNREACHABLE');
    }
}

// ── Sandbox session ────────────────────────────────────────────────────────

let sandboxJwt: { token: string; mintedAt: number } | null = null;
const SANDBOX_JWT_TTL_MS = 20 * 60 * 1000;

/**
 * POST /v2/auth/sandbox swaps the secret key's Metrc session for a JWT on the
 * matching sandbox host. Metrc must have provisioned a sandbox for that login;
 * otherwise T3 answers 400 and we surface that plainly.
 */
async function sandboxToken(apiKey: string, force = false): Promise<string> {
    if (!force && sandboxJwt && Date.now() - sandboxJwt.mintedAt < SANDBOX_JWT_TTL_MS) return sandboxJwt.token;
    const res = await rawFetch(buildUrl('/v2/auth/sandbox'), {
        method: 'POST',
        headers: { Accept: 'application/json', 'X-T3-API-Key': apiKey },
    });
    const body = await parseBody(res);
    if (res.status === 400) {
        throw new T3Error(
            'T3_MODE=sandbox, but Metrc has not provisioned a sandbox for this login. Ask Metrc support for sandbox access on the state hostname, or switch T3_MODE to read-only.',
            400,
            'SANDBOX_UNAVAILABLE',
        );
    }
    if (!res.ok) throw describeError(res.status, body);
    const token = (body as { accessToken?: string } | null)?.accessToken;
    if (!token) throw new T3Error('T3 sandbox exchange returned no token.', 502, 'SANDBOX_NO_TOKEN');
    sandboxJwt = { token, mintedAt: Date.now() };
    return token;
}

/** Exposed for tests. */
export function resetSandboxSession() {
    sandboxJwt = null;
}

// ── Core request ───────────────────────────────────────────────────────────

export async function t3Request<T>(
    path: string,
    opts: { method?: 'GET' | 'POST'; query?: Query; body?: unknown } = {},
): Promise<T> {
    const apiKey = process.env.T3_API_KEY;
    if (!apiKey) throw new T3Error('T3 is not configured on this deploy (T3_API_KEY unset).', 503, 'NOT_CONFIGURED');

    const url = buildUrl(path, opts.query);
    const send = async (auth: Record<string, string>) => {
        const headers: Record<string, string> = { Accept: 'application/json', ...auth };
        if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
        return rawFetch(url, {
            method: opts.method ?? 'GET',
            headers,
            body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        });
    };

    let res: Response;
    if (t3Mode() === 'sandbox') {
        res = await send({ Authorization: `Bearer ${await sandboxToken(apiKey)}` });
        if (res.status === 401) res = await send({ Authorization: `Bearer ${await sandboxToken(apiKey, true)}` });
    } else {
        res = await send({ 'X-T3-API-Key': apiKey });
    }

    const json = await parseBody(res);
    if (!res.ok) throw describeError(res.status, json);
    return json as T;
}

// ── Account ────────────────────────────────────────────────────────────────

export interface T3WhoAmI {
    authMode?: string;
    username?: string;
    hostname?: string;
    hasT3plus?: boolean;
    t3plusSubscriptionTier?: string | null;
    subscriptionStatus?: string | null;
}

export const t3WhoAmI = () => t3Request<T3WhoAmI>('/v2/auth/whoami');

export const t3Licenses = () => t3Request<Array<{ licenseNumber: string; licenseName: string }>>('/v2/licenses');

/** Metrc permissions on the packages page for one licence, e.g. "packages/active:new_transfer". */
export const t3PackagePermissions = (licenseNumber: string) =>
    t3Request<string[]>('/v2/permissions', { query: { licenseNumber, view: 'packages' } });

export const grantsAction = (permissions: string[], action: string) => permissions.some(p => p.split(':')[1] === action);

// ── Collections ────────────────────────────────────────────────────────────

interface Page<T> {
    page?: number;
    totalPages?: number;
    pageSize?: number;
    total?: number;
    data?: T[];
}

/** Reads every page of a T3 collection endpoint. */
export async function t3Collection<T>(path: string, query: Query = {}, maxPages = 20): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
        const res = await t3Request<Page<T>>(path, { query: { ...query, page, pageSize: PAGE_SIZE } });
        out.push(...(res.data ?? []));
        const totalPages = res.totalPages ?? (res.total !== undefined ? Math.ceil(res.total / (res.pageSize || PAGE_SIZE)) : 1);
        if (page >= totalPages || (res.data ?? []).length === 0) break;
    }
    return out;
}

export interface T3Package {
    id: number;
    label: string;
    licenseNumber?: string;
    quantity?: number;
    unitOfMeasureAbbreviation?: string;
    unitOfMeasureName?: string;
    unitOfMeasureQuantityType?: string;
    item?: {
        id?: number;
        name?: string;
        productCategoryName?: string;
        strainName?: string | null;
        unitWeight?: number | null;
        unitWeightUnitOfMeasureAbbreviation?: string | null;
        unitOfMeasureName?: string;
        quantityTypeName?: string;
    } | null;
    sourcePackageLabels?: string | null;
    sourceHarvestNames?: string | null;
    productionBatchNumber?: string | null;
    labTestingStateName?: string;
    isOnHold?: boolean;
    isInTransit?: boolean;
    isFinished?: boolean;
    isTestingSample?: boolean;
    isProductionBatch?: boolean;
    isTradeSample?: boolean;
    isDonation?: boolean;
    packagedDate?: string | null;
    finishedDate?: string | null;
    lastModified?: string | null;
    locationName?: string | null;
    note?: string | null;
}

// ── Sync lists (Metrc → NeuroCann mirror; see utils/metrcSync.ts) ──────────

/** GET /v2/items — the licence's registered product items. */
export interface T3Item {
    id: number;
    name: string;
    productCategoryName?: string;
    productCategoryTypeName?: string;
    quantityTypeName?: string;
    unitOfMeasureName?: string;
    strainName?: string | null;
    unitWeight?: number | null;
    unitWeightUnitOfMeasureAbbreviation?: string | null;
    isUsed?: boolean;
    isArchived?: boolean;
    lastModified?: string | null;
}

/** GET /v2/strains */
export interface T3Strain {
    id: number;
    name: string;
    testingStatus?: string;
    isUsed?: boolean;
    isArchived?: boolean;
}

/** GET /v2/locations/active */
export interface T3Location {
    id: number;
    name: string;
    locationTypeName?: string;
    forPlants?: boolean;
    forPlantBatches?: boolean;
    forHarvests?: boolean;
    forPackages?: boolean;
    isArchived?: boolean;
}

const ITEM_MASK = [
    'id', 'name', 'productCategoryName', 'productCategoryTypeName', 'quantityTypeName', 'unitOfMeasureName',
    'strainName', 'unitWeight', 'unitWeightUnitOfMeasureAbbreviation', 'isUsed', 'isArchived', 'lastModified',
].join(',');
const STRAIN_MASK = 'id,name,testingStatus,isUsed,isArchived';
const LOCATION_MASK = 'id,name,locationTypeName,forPlants,forPlantBatches,forHarvests,forPackages,isArchived';
const SYNC_PACKAGE_MASK = [
    'id', 'label', 'licenseNumber', 'quantity', 'unitOfMeasureAbbreviation', 'unitOfMeasureName', 'unitOfMeasureQuantityType',
    'item.id', 'item.name', 'item.productCategoryName', 'item.strainName', 'item.unitWeight', 'item.unitWeightUnitOfMeasureAbbreviation',
    'item.unitOfMeasureName', 'item.quantityTypeName',
    'sourcePackageLabels', 'sourceHarvestNames', 'productionBatchNumber', 'labTestingStateName',
    'isOnHold', 'isInTransit', 'isFinished', 'isTestingSample', 'isProductionBatch', 'isTradeSample', 'isDonation',
    'packagedDate', 'finishedDate', 'lastModified', 'locationName', 'note',
].join(',');

/** A first full pull across a busy licence can run past 20 pages of 500. */
const SYNC_MAX_PAGES = 60;

/**
 * One package list (`/v2/packages/active|onhold|intransit|inactive`) for a
 * licence, optionally only rows Metrc modified at or after `since`
 * (`lastModified__gte:<ISO8601>`, a datetime filter per the T3 spec).
 */
export const t3PackageList = (path: string, licenseNumber: string, since?: Date) =>
    t3Collection<T3Package>(path, {
        licenseNumber,
        filter: since ? `lastModified__gte:${since.toISOString()}` : undefined,
        collectionMask: SYNC_PACKAGE_MASK,
    }, SYNC_MAX_PAGES);

export const t3Items = (licenseNumber: string, since?: Date) =>
    t3Collection<T3Item>('/v2/items', {
        licenseNumber,
        filter: since ? `lastModified__gte:${since.toISOString()}` : undefined,
        collectionMask: ITEM_MASK,
    }, SYNC_MAX_PAGES);

/** Strains and locations carry no lastModified in T3, so they are always a full pull. */
export const t3Strains = (licenseNumber: string) =>
    t3Collection<T3Strain>('/v2/strains', { licenseNumber, collectionMask: STRAIN_MASK }, SYNC_MAX_PAGES);

export const t3Locations = (licenseNumber: string) =>
    t3Collection<T3Location>('/v2/locations/active', { licenseNumber, collectionMask: LOCATION_MASK }, SYNC_MAX_PAGES);

/** GET /v2/plantbatches/active|inactive — Metrc's immature plants (NeuroCann nursery batches). */
export interface T3PlantBatch {
    id: number;
    name: string;
    plantBatchTypeName?: string | null;
    locationName?: string | null;
    strainName?: string | null;
    untrackedCount?: number;
    trackedCount?: number;
    packagedCount?: number;
    destroyedCount?: number;
    harvestedCount?: number;
    plantedDate?: string | null;
    isOnHold?: boolean;
    lastModified?: string | null;
}

/** GET /v2/harvests/active|inactive */
export interface T3Harvest {
    id: number;
    name: string;
    harvestTypeName?: string | null;
    sourceStrainNames?: string | null;
    dryingLocationName?: string | null;
    currentWeight?: number;
    totalWasteWeight?: number;
    totalWetWeight?: number;
    plantCount?: number;
    unitOfWeightAbbreviation?: string | null;
    isOnHold?: boolean;
    harvestStartDate?: string | null;
    isFinished?: boolean;
    finishedDate?: string | null;
    lastModified?: string | null;
}

/** GET /v2/plants/vegetative|flowering|inactive — tagged plants. */
export interface T3Plant {
    id: number;
    label: string;
    stateName?: string | null;
    growthPhaseName?: string | null;
    plantBatchName?: string | null;
    plantBatchId?: number | null;
    strainName?: string | null;
    locationName?: string | null;
    harvestId?: number | null;
    harvestedDate?: string | null;
    isOnHold?: boolean;
    plantedDate?: string | null;
    vegetativeDate?: string | null;
    floweringDate?: string | null;
    destroyedDate?: string | null;
    lastModified?: string | null;
}

const PLANT_BATCH_MASK = [
    'id', 'name', 'plantBatchTypeName', 'locationName', 'strainName', 'untrackedCount', 'trackedCount',
    'packagedCount', 'destroyedCount', 'harvestedCount', 'plantedDate', 'isOnHold', 'lastModified',
].join(',');
const HARVEST_MASK = [
    'id', 'name', 'harvestTypeName', 'sourceStrainNames', 'dryingLocationName', 'currentWeight', 'totalWasteWeight',
    'totalWetWeight', 'plantCount', 'unitOfWeightAbbreviation', 'isOnHold', 'harvestStartDate', 'isFinished', 'finishedDate', 'lastModified',
].join(',');
const PLANT_MASK = [
    'id', 'label', 'stateName', 'growthPhaseName', 'plantBatchName', 'plantBatchId', 'strainName', 'locationName',
    'harvestId', 'harvestedDate', 'isOnHold', 'plantedDate', 'vegetativeDate', 'floweringDate', 'destroyedDate', 'lastModified',
].join(',');

const sinceFilter = (since?: Date) => (since ? `lastModified__gte:${since.toISOString()}` : undefined);

export const t3PlantBatchList = (path: string, licenseNumber: string, since?: Date) =>
    t3Collection<T3PlantBatch>(path, { licenseNumber, filter: sinceFilter(since), collectionMask: PLANT_BATCH_MASK }, SYNC_MAX_PAGES);

export const t3HarvestList = (path: string, licenseNumber: string, since?: Date) =>
    t3Collection<T3Harvest>(path, { licenseNumber, filter: sinceFilter(since), collectionMask: HARVEST_MASK }, SYNC_MAX_PAGES);

export const t3PlantList = (path: string, licenseNumber: string, since?: Date) =>
    t3Collection<T3Plant>(path, { licenseNumber, filter: sinceFilter(since), collectionMask: PLANT_MASK }, SYNC_MAX_PAGES);

const PACKAGE_MASK = [
    'id', 'label', 'licenseNumber', 'quantity', 'unitOfMeasureAbbreviation',
    'item.name', 'item.productCategoryName', 'item.strainName', 'item.unitWeight', 'item.unitWeightUnitOfMeasureAbbreviation',
    'sourcePackageLabels', 'productionBatchNumber', 'labTestingStateName',
    'isOnHold', 'isInTransit', 'isFinished', 'isTestingSample', 'packagedDate', 'locationName',
].join(',');

/**
 * Looks up packages by tag label on one licence, OR-ing `label__eq` filters in
 * chunks so one scanned order costs a handful of requests rather than one per tag.
 */
export async function t3PackagesByLabel(path: string, licenseNumber: string, labels: string[]): Promise<Map<string, T3Package>> {
    const found = new Map<string, T3Package>();
    const unique = Array.from(new Set(labels.map(l => l.toUpperCase())));
    for (let i = 0; i < unique.length; i += LABEL_FILTER_CHUNK) {
        const chunk = unique.slice(i, i + LABEL_FILTER_CHUNK);
        const rows = await t3Collection<T3Package>(path, {
            licenseNumber,
            filter: chunk.map(l => `label__eq:${l}`),
            filterLogic: chunk.length > 1 ? 'or' : undefined,
            collectionMask: PACKAGE_MASK,
        });
        for (const r of rows) if (r.label) found.set(r.label.toUpperCase(), r);
    }
    return found;
}

/** Packages Metrc will accept on a new transfer from this licence. */
export const t3EligibleTransferPackages = (licenseNumber: string, labels: string[]) =>
    t3PackagesByLabel('/v2/transfers/create/packages', licenseNumber, labels);

/** Everything active on the licence, eligible or not. */
export const t3ActivePackages = (licenseNumber: string, labels: string[]) =>
    t3PackagesByLabel('/v2/packages/active', licenseNumber, labels);

// ── Transfer creation ──────────────────────────────────────────────────────

export interface T3TransferType {
    id: number;
    name: string;
    forLicensedShipments?: boolean;
    forExternalOutgoingShipments?: boolean;
    transactionType?: string;
    transactionTypeName?: string;
    requiresDestinationGrossWeight?: boolean;
    requiresPackagesGrossWeight?: boolean;
    requiresVehicleRegistrationNumber?: boolean;
    requiresInvoiceNumber?: boolean;
    minimumWholesalePrice?: number | null;
    maximumWholesalePrice?: number | null;
}

export interface T3UnitOfMeasure {
    id: number;
    name: string;
    abbreviation?: string;
    quantityType?: string;
    isArchived?: boolean;
}

export interface T3TransferInputs {
    defaultPhoneNumberForQuestions?: string;
    transferTypes?: T3TransferType[];
    unitsOfMeasure?: T3UnitOfMeasure[];
    drivers?: Array<{ id: number; name?: string; employeeId?: string; driversLicenseNumber?: string }>;
    vehicles?: Array<{ id: number; make?: string; model?: string; licensePlateNumber?: string }>;
}

export const t3TransferInputs = (licenseNumber: string) =>
    t3Request<T3TransferInputs>('/v2/transfers/create/inputs', { query: { licenseNumber } });

export interface T3Facility {
    id: number;
    licenseNumber: string;
    facilityName: string;
    facilityTypeName?: string;
}

async function facilityByLicense(path: string, licenseNumber: string, target: string): Promise<T3Facility | null> {
    const rows = await t3Collection<T3Facility>(path, {
        licenseNumber,
        filter: `licenseNumber__eq:${target}`,
        collectionMask: 'id,licenseNumber,facilityName,facilityTypeName',
    }, 1);
    return rows.find(r => r.licenseNumber?.toUpperCase() === target.toUpperCase()) ?? rows[0] ?? null;
}

export const t3Destination = (licenseNumber: string, recipientLicense: string) =>
    facilityByLicense('/v2/transfers/create/destinations', licenseNumber, recipientLicense);

export const t3Transporter = (licenseNumber: string, transporterLicense: string) =>
    facilityByLicense('/v2/transfers/create/transporters', licenseNumber, transporterLicense);

export interface T3CreateTransferResult {
    message?: string;
}

/**
 * Dry runs ask T3 for dynamic validation too (it loads the real Metrc form and
 * checks ids exist) so a read-only deploy still gets a meaningful answer.
 */
export const t3CreateTransfer = (licenseNumber: string, payload: unknown, submit: boolean) =>
    t3Request<T3CreateTransferResult>('/v2/transfers/create', {
        method: 'POST',
        query: { licenseNumber, submit: submit ? 'true' : undefined, applyDynamicValidation: 'true' },
        body: [payload],
    });

export interface T3OutgoingTransfer {
    id: number;
    manifestNumber?: string;
    recipientFacilityLicenseNumber?: string;
    createdDateTime?: string;
    packageCount?: number;
}

/** Newest outgoing transfers first; enough to spot one just created. */
export const t3RecentOutgoing = (licenseNumber: string) =>
    t3Collection<T3OutgoingTransfer>('/v2/transfers/outgoing/active', {
        licenseNumber,
        sort: 'createdDateTime:desc',
        collectionMask: 'id,manifestNumber,recipientFacilityLicenseNumber,createdDateTime,packageCount',
    }, 1);
