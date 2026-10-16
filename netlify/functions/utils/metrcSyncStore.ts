import type { ExistingPackage, MetrcItemRow, PackageRow, ProductTypeSpec, RoomRow, StrainRow } from './metrcSync';
import type { MetrcSyncCounts, MetrcSyncError, MetrcSyncList, MetrcSyncReport, MetrcSyncRunStatus } from '../../../shared/manifest/metrcSync';

/**
 * Database side of the Metrc sync. Everything here is a plain parameterised
 * statement over one pooled client so a run is a handful of batched upserts
 * rather than one HTTP round trip per package. Upserts name the Metrc-owned
 * columns explicitly; NeuroCann-owned columns (notes, contaminants, harvest
 * links, trim data, created_by …) are never in a SET list.
 */

export interface Queryable {
    query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

export interface RunRow {
    id: string;
    company_id: string;
    trigger: 'schedule' | 'manual';
    status: MetrcSyncRunStatus;
    dry_run: boolean;
    started_at: string | null;
}

export interface ListState {
    cursor: Date | null;
    lastSuccessAt: Date | null;
    lastError: string | null;
}

export interface UpsertCounts {
    inserted: number;
    updated: number;
    unchanged: number;
}

export interface FinishRun {
    status: MetrcSyncRunStatus;
    counts: MetrcSyncCounts;
    errors: MetrcSyncError[];
    report?: MetrcSyncReport | null;
    error?: string | null;
}

/** A run that stops reporting for this long is presumed dead (background functions cap at 15 min). */
export const STALE_RUN_MINUTES = 20;
const BATCH = 200;
const UNIQUE_VIOLATION = '23505';

const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === UNIQUE_VIOLATION;

const chunk = <T>(rows: T[]): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < rows.length; i += BATCH) out.push(rows.slice(i, i + BATCH));
    return out;
};

const tally = (rows: Array<{ inserted: boolean }>, into: UpsertCounts) => {
    for (const r of rows) {
        if (r.inserted) into.inserted++;
        else into.updated++;
    }
};

export class MetrcSyncStore {
    constructor(private readonly db: Queryable) {}

    // ── Runs (also the lock) ───────────────────────────────────────────────

    /** Kills runs a dead lambda left 'running' so the partial unique index can't wedge the sync. */
    async failStaleRuns(companyId: string): Promise<void> {
        await this.db.query(
            `UPDATE metrc_sync_runs
                SET status = 'failed', finished_at = NOW(),
                    error = COALESCE(error, 'Run stopped reporting; presumed killed at the function time limit.')
              WHERE company_id = $1 AND status = 'running'
                AND started_at < NOW() - ($2 || ' minutes')::interval`,
            [companyId, String(STALE_RUN_MINUTES)],
        );
        await this.db.query(
            `UPDATE metrc_sync_runs
                SET status = 'skipped', finished_at = NOW(), error = 'Never started.'
              WHERE company_id = $1 AND status = 'queued'
                AND queued_at < NOW() - interval '30 minutes'`,
            [companyId],
        );
    }

    /** Scheduler path: a queued row is the capability; move it to running or explain why not. */
    async claimQueuedRun(runId: string, companyId: string): Promise<RunRow | null> {
        try {
            const { rows } = await this.db.query(
                `UPDATE metrc_sync_runs SET status = 'running', started_at = NOW()
                  WHERE id = $1 AND company_id = $2 AND status = 'queued'
                  RETURNING id, company_id, trigger, status, dry_run, started_at`,
                [runId, companyId],
            );
            return (rows[0] as RunRow) ?? null;
        } catch (err) {
            if (!isUniqueViolation(err)) throw err;
            await this.db.query(
                `UPDATE metrc_sync_runs SET status = 'skipped', finished_at = NOW(), error = 'Another sync was already running.'
                  WHERE id = $1 AND status = 'queued'`,
                [runId],
            );
            return null;
        }
    }

    /**
     * Queue a run for the background function to claim. The run id doubles as
     * the capability the background function requires, so the scheduler and the
     * Sync now button go through the same door.
     */
    async enqueueRun(companyId: string, opts: { trigger: 'schedule' | 'manual'; startedBy?: string | null; dryRun?: boolean }): Promise<string> {
        const { rows } = await this.db.query(
            `INSERT INTO metrc_sync_runs (company_id, trigger, status, started_by, dry_run) VALUES ($1, $2, 'queued', $3, $4) RETURNING id`,
            [companyId, opts.trigger, opts.startedBy ?? null, Boolean(opts.dryRun)],
        );
        return rows[0].id as string;
    }

    /** True while a run is running or queued for this company. */
    async hasActiveRun(companyId: string): Promise<boolean> {
        const { rows } = await this.db.query(
            `SELECT 1 FROM metrc_sync_runs WHERE company_id = $1 AND status IN ('queued', 'running') LIMIT 1`,
            [companyId],
        );
        return rows.length > 0;
    }

    async finishRun(runId: string, result: FinishRun): Promise<void> {
        await this.db.query(
            `UPDATE metrc_sync_runs
                SET status = $2, finished_at = NOW(), counts = $3::jsonb, errors = $4::jsonb, report = $5::jsonb, error = $6
              WHERE id = $1`,
            [runId, result.status, JSON.stringify(result.counts), JSON.stringify(result.errors), result.report ? JSON.stringify(result.report) : null, result.error ?? null],
        );
    }

    /** Progress so the Settings panel can show a long first run moving. */
    async touchRun(runId: string, counts: MetrcSyncCounts, errors: MetrcSyncError[]): Promise<void> {
        await this.db.query(`UPDATE metrc_sync_runs SET counts = $2::jsonb, errors = $3::jsonb WHERE id = $1`, [runId, JSON.stringify(counts), JSON.stringify(errors)]);
    }

    // ── Cursors ────────────────────────────────────────────────────────────

    async listStates(companyId: string): Promise<Map<string, ListState>> {
        const { rows } = await this.db.query(
            `SELECT license_number, list, cursor, last_success_at, last_error FROM metrc_sync_state WHERE company_id = $1`,
            [companyId],
        );
        const out = new Map<string, ListState>();
        for (const r of rows) {
            out.set(stateKey(r.license_number, r.list), {
                cursor: r.cursor ? new Date(r.cursor) : null,
                lastSuccessAt: r.last_success_at ? new Date(r.last_success_at) : null,
                lastError: r.last_error ?? null,
            });
        }
        return out;
    }

    async markListSuccess(companyId: string, license: string, list: MetrcSyncList, cursor: Date): Promise<void> {
        await this.db.query(
            `INSERT INTO metrc_sync_state (company_id, license_number, list, cursor, last_success_at, last_error, last_error_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NULL, NULL, NOW())
             ON CONFLICT (company_id, license_number, list) DO UPDATE
                SET cursor = EXCLUDED.cursor, last_success_at = NOW(), last_error = NULL, last_error_at = NULL, updated_at = NOW()`,
            [companyId, license, list, cursor],
        );
    }

    async markListError(companyId: string, license: string, list: MetrcSyncList, message: string): Promise<void> {
        await this.db.query(
            `INSERT INTO metrc_sync_state (company_id, license_number, list, last_error, last_error_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW())
             ON CONFLICT (company_id, license_number, list) DO UPDATE
                SET last_error = EXCLUDED.last_error, last_error_at = NOW(), updated_at = NOW()`,
            [companyId, license, list, message.slice(0, 2000)],
        );
    }

    // ── Reference data ─────────────────────────────────────────────────────

    async ensureProductTypes(companyId: string, specs: ProductTypeSpec[]): Promise<void> {
        const byName = new Map<string, ProductTypeSpec>();
        for (const s of specs) if (!byName.has(s.name)) byName.set(s.name, s);
        const list = Array.from(byName.values());
        if (!list.length) return;
        await this.db.query(
            `INSERT INTO product_types (company_id, name, display_name, category, default_unit, is_cannabis, sort_order)
             SELECT $1, * FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[], $6::boolean[], $7::int[])
             ON CONFLICT (company_id, name) DO NOTHING`,
            [companyId, list.map(s => s.name), list.map(s => s.displayName), list.map(s => s.category), list.map(s => s.defaultUnit), list.map(() => true), list.map(() => 500)],
        );
    }

    async upsertItems(companyId: string, rows: MetrcItemRow[]): Promise<UpsertCounts> {
        const counts: UpsertCounts = { inserted: 0, updated: 0, unchanged: 0 };
        for (const batch of chunk(dedupeBy(rows, r => `${r.license_number}::${r.name.toLowerCase()}`))) {
            const { rows: written } = await this.db.query(
                `INSERT INTO metrc_items (company_id, license_number, name, category, strain, unit_of_measure, package_type, metrc_id, metrc_last_modified, metrc_synced_at)
                 SELECT $1, u.license_number, u.name, u.category, u.strain, u.unit_of_measure, u.package_type, u.metrc_id, u.metrc_last_modified, NOW()
                   FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::bigint[], $9::timestamptz[])
                     AS u(license_number, name, category, strain, unit_of_measure, package_type, metrc_id, metrc_last_modified)
                 ON CONFLICT (company_id, license_number, name) DO UPDATE SET
                    category = EXCLUDED.category,
                    strain = EXCLUDED.strain,
                    unit_of_measure = EXCLUDED.unit_of_measure,
                    package_type = EXCLUDED.package_type,
                    metrc_id = EXCLUDED.metrc_id,
                    metrc_last_modified = EXCLUDED.metrc_last_modified,
                    metrc_synced_at = NOW(),
                    updated_at = NOW()
                 WHERE (metrc_items.category, metrc_items.strain, metrc_items.unit_of_measure, metrc_items.package_type, metrc_items.metrc_id, metrc_items.metrc_last_modified)
                       IS DISTINCT FROM
                       (EXCLUDED.category, EXCLUDED.strain, EXCLUDED.unit_of_measure, EXCLUDED.package_type, EXCLUDED.metrc_id, EXCLUDED.metrc_last_modified)
                 RETURNING (xmax = 0) AS inserted`,
                [
                    companyId,
                    batch.map(r => r.license_number), batch.map(r => r.name), batch.map(r => r.category), batch.map(r => r.strain),
                    batch.map(r => r.unit_of_measure), batch.map(r => r.package_type), batch.map(r => r.metrc_id), batch.map(r => r.metrc_last_modified),
                ],
            );
            tally(written, counts);
            counts.unchanged += batch.length - written.length;
        }
        return counts;
    }

    async upsertStrains(companyId: string, rows: StrainRow[]): Promise<UpsertCounts> {
        const counts: UpsertCounts = { inserted: 0, updated: 0, unchanged: 0 };
        for (const batch of chunk(dedupeByLowerName(rows))) {
            const { rows: written } = await this.db.query(
                `INSERT INTO strains (company_id, name, metrc_id, metrc_license, metrc_synced_at)
                 SELECT $1, u.name, u.metrc_id, u.metrc_license, NOW()
                   FROM UNNEST($2::text[], $3::bigint[], $4::text[]) AS u(name, metrc_id, metrc_license)
                 ON CONFLICT (company_id, LOWER(name)) DO UPDATE SET
                    metrc_id = EXCLUDED.metrc_id,
                    metrc_license = EXCLUDED.metrc_license,
                    metrc_synced_at = NOW(),
                    updated_at = NOW()
                 WHERE (strains.metrc_id, strains.metrc_license) IS DISTINCT FROM (EXCLUDED.metrc_id, EXCLUDED.metrc_license)
                 RETURNING (xmax = 0) AS inserted`,
                [companyId, batch.map(r => r.name), batch.map(r => r.metrc_id), batch.map(r => r.metrc_license)],
            );
            tally(written, counts);
            counts.unchanged += batch.length - written.length;
        }
        return counts;
    }

    async upsertRooms(companyId: string, rows: RoomRow[]): Promise<UpsertCounts> {
        const counts: UpsertCounts = { inserted: 0, updated: 0, unchanged: 0 };
        for (const batch of chunk(dedupeByLowerName(rows))) {
            const { rows: written } = await this.db.query(
                `INSERT INTO rooms (company_id, name, room_type, metrc_id, metrc_license, metrc_synced_at)
                 SELECT $1, u.name, 'general', u.metrc_id, u.metrc_license, NOW()
                   FROM UNNEST($2::text[], $3::bigint[], $4::text[]) AS u(name, metrc_id, metrc_license)
                 ON CONFLICT (company_id, LOWER(name)) DO UPDATE SET
                    metrc_id = EXCLUDED.metrc_id,
                    metrc_license = EXCLUDED.metrc_license,
                    metrc_synced_at = NOW(),
                    updated_at = NOW()
                 WHERE (rooms.metrc_id, rooms.metrc_license) IS DISTINCT FROM (EXCLUDED.metrc_id, EXCLUDED.metrc_license)
                 RETURNING (xmax = 0) AS inserted`,
                [companyId, batch.map(r => r.name), batch.map(r => r.metrc_id), batch.map(r => r.metrc_license)],
            );
            tally(written, counts);
            counts.unchanged += batch.length - written.length;
        }
        return counts;
    }

    // ── Packages ───────────────────────────────────────────────────────────

    /** metrc_items.name → id for one licence, to link packages to their item row. */
    async metrcItemIds(companyId: string, license: string): Promise<Map<string, string>> {
        const { rows } = await this.db.query(`SELECT id, name FROM metrc_items WHERE company_id = $1 AND license_number = $2`, [companyId, license]);
        return new Map(rows.map(r => [String(r.name).toLowerCase(), r.id as string]));
    }

    async existingPackages(companyId: string, labels: string[]): Promise<Map<string, ExistingPackage>> {
        const out = new Map<string, ExistingPackage>();
        for (const batch of chunk(labels)) {
            const { rows } = await this.db.query(
                `SELECT label, metrc_id, metrc_last_modified, item_name, strain, package_type, quantity, unit, location, status, lab_testing_state, license_number
                   FROM packages WHERE company_id = $1 AND label = ANY($2::text[])`,
                [companyId, batch],
            );
            for (const r of rows) out.set(String(r.label).toUpperCase(), r as ExistingPackage);
        }
        return out;
    }

    async upsertPackages(companyId: string, rows: PackageRow[], itemIds: Map<string, string>): Promise<Omit<UpsertCounts, 'unchanged'>> {
        const counts = { inserted: 0, updated: 0 };
        for (const batch of chunk(dedupeBy(rows, r => r.label))) {
            const { rows: written } = await this.db.query(
                `INSERT INTO packages (
                    company_id, created_by, label, license_number, metrc_id, metrc_license, metrc_last_modified,
                    item_name, metrc_item_id, strain, package_type, quantity, unit, location, status,
                    lab_testing_state, metrc_lab_state, packaged_date, finished_date,
                    is_production_batch, is_trade_sample, is_donation, source_package_labels, source_harvest_names, metrc_synced_at
                 )
                 SELECT $1, NULL, u.label, u.license_number, u.metrc_id, u.metrc_license, u.metrc_last_modified,
                        u.item_name, u.metrc_item_id::uuid, u.strain, u.package_type, u.quantity, u.unit, u.location, u.status,
                        u.lab_testing_state, u.metrc_lab_state, COALESCE(u.packaged_date, NOW()), u.finished_date,
                        u.is_production_batch, u.is_trade_sample, u.is_donation, arr.source_package_labels, arr.source_harvest_names, NOW()
                   FROM UNNEST(
                        $2::text[], $3::text[], $4::bigint[], $5::text[], $6::timestamptz[],
                        $7::text[], $8::text[], $9::text[], $10::text[], $11::numeric[], $12::text[], $13::text[], $14::text[],
                        $15::text[], $16::text[], $17::timestamptz[], $18::timestamptz[],
                        $19::boolean[], $20::boolean[], $21::boolean[], $22::text[], $23::text[]
                   ) AS u(
                        label, license_number, metrc_id, metrc_license, metrc_last_modified,
                        item_name, metrc_item_id, strain, package_type, quantity, unit, location, status,
                        lab_testing_state, metrc_lab_state, packaged_date, finished_date,
                        is_production_batch, is_trade_sample, is_donation, source_package_labels_json, source_harvest_names_json
                   )
                   CROSS JOIN LATERAL (
                        SELECT ARRAY(SELECT jsonb_array_elements_text(u.source_package_labels_json::jsonb)) AS source_package_labels,
                               ARRAY(SELECT jsonb_array_elements_text(u.source_harvest_names_json::jsonb)) AS source_harvest_names
                   ) arr
                 ON CONFLICT (company_id, label) DO UPDATE SET
                    license_number = EXCLUDED.license_number,
                    metrc_id = EXCLUDED.metrc_id,
                    metrc_license = EXCLUDED.metrc_license,
                    metrc_last_modified = EXCLUDED.metrc_last_modified,
                    item_name = EXCLUDED.item_name,
                    metrc_item_id = COALESCE(EXCLUDED.metrc_item_id, packages.metrc_item_id),
                    strain = CASE WHEN EXCLUDED.strain = '' THEN packages.strain ELSE EXCLUDED.strain END,
                    package_type = EXCLUDED.package_type,
                    quantity = EXCLUDED.quantity,
                    unit = EXCLUDED.unit,
                    location = EXCLUDED.location,
                    status = EXCLUDED.status,
                    lab_testing_state = EXCLUDED.lab_testing_state,
                    metrc_lab_state = EXCLUDED.metrc_lab_state,
                    packaged_date = COALESCE(EXCLUDED.packaged_date, packages.packaged_date),
                    finished_date = EXCLUDED.finished_date,
                    is_production_batch = EXCLUDED.is_production_batch,
                    is_trade_sample = EXCLUDED.is_trade_sample,
                    is_donation = EXCLUDED.is_donation,
                    source_package_labels = EXCLUDED.source_package_labels,
                    source_harvest_names = EXCLUDED.source_harvest_names,
                    metrc_synced_at = NOW(),
                    updated_at = NOW()
                 RETURNING (xmax = 0) AS inserted`,
                [
                    companyId,
                    batch.map(r => r.label), batch.map(r => r.license_number), batch.map(r => r.metrc_id), batch.map(r => r.metrc_license), batch.map(r => r.metrc_last_modified),
                    batch.map(r => r.item_name), batch.map(r => (r.item_name ? itemIds.get(r.item_name.toLowerCase()) ?? null : null)), batch.map(r => r.strain),
                    batch.map(r => r.package_type), batch.map(r => r.quantity), batch.map(r => r.unit), batch.map(r => r.location), batch.map(r => r.status),
                    batch.map(r => r.lab_testing_state), batch.map(r => r.metrc_lab_state), batch.map(r => r.packaged_date), batch.map(r => r.finished_date),
                    batch.map(r => r.is_production_batch), batch.map(r => r.is_trade_sample), batch.map(r => r.is_donation),
                    batch.map(r => JSON.stringify(r.source_package_labels)), batch.map(r => JSON.stringify(r.source_harvest_names)),
                ],
            );
            tally(written, counts as UpsertCounts);
        }
        return counts;
    }
}


export const stateKey = (license: string, list: string) => `${license}::${list}`;

/** Metrc can list the same name on several licences; the strains/rooms tables key on name per company. */
function dedupeByLowerName<T extends { name: string }>(rows: T[]): T[] {
    return dedupeBy(rows, r => r.name.toLowerCase());
}

/** Last occurrence wins, so a row that appears on two lists keeps the later list's state. */
function dedupeBy<T>(rows: T[], key: (r: T) => string): T[] {
    const seen = new Map<string, T>();
    for (const r of rows) seen.set(key(r), r);
    return Array.from(seen.values());
}
