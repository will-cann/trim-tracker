import type { Queryable } from '../db';
import { enqueue } from '../jobs';
import { logActivity } from '../prospects';
import { researchCompany, type Research, type ResearchInput, type ResearchResult } from './claudeResearch';
import { configuredLicenseSources, type LicenseRecord, type LicenseSource } from './licenses';

/** Don't re-research an org more often than this unless forced. */
const REFRESH_DAYS = 30;

export interface EnrichDeps {
    research?: (input: ResearchInput) => Promise<ResearchResult | null>;
    licenseSources?: LicenseSource[];
}

export type EnrichOutcome =
    | { status: 'skipped'; reason: string }
    | { status: 'enriched'; fitScore: number | null; licenses: number };

/**
 * Enrich one organization: Claude web research, then state license lookups
 * seeded by what research found. Writes enrichment_runs, licenses and the
 * organization's enrichment/fit_score, then queues an Attio sync.
 */
export async function enrichOrganization(
    db: Queryable,
    organizationId: string,
    opts: { force?: boolean } = {},
    deps: EnrichDeps = {},
): Promise<EnrichOutcome> {
    const research = deps.research ?? ((input: ResearchInput) => researchCompany(input));
    const sources = deps.licenseSources ?? configuredLicenseSources();

    const { rows: [org] } = await db.query(`SELECT * FROM organizations WHERE id = $1`, [organizationId]);
    if (!org) return { status: 'skipped', reason: 'organization not found' };
    if (!opts.force && org.enriched_at && Date.now() - new Date(org.enriched_at).getTime() < REFRESH_DAYS * 86400_000) {
        return { status: 'skipped', reason: `enriched within the last ${REFRESH_DAYS} days` };
    }

    const { rows: [context] } = await db.query(
        `SELECT p.name AS person_name, p.role AS person_role, dr.state, dr.operation_type
         FROM people p
         LEFT JOIN demo_requests dr ON dr.person_id = p.id
         WHERE p.organization_id = $1
         ORDER BY dr.created_at DESC NULLS LAST
         LIMIT 1`,
        [organizationId],
    );

    // ── Claude research ─────────────────────────────────────────────────────
    let output: Research | null = null;
    const { rows: [run] } = await db.query(
        `INSERT INTO enrichment_runs (organization_id, provider, status) VALUES ($1, 'claude_research', 'running') RETURNING id`,
        [organizationId],
    );
    try {
        const result = await research({
            company: org.name,
            domain: org.domain,
            personName: context?.person_name,
            personRole: context?.person_role,
            statedState: context?.state,
            statedOperation: context?.operation_type,
        });
        if (result) {
            output = result.output;
            await db.query(
                `UPDATE enrichment_runs SET status = 'succeeded', output = $2, input_tokens = $3, output_tokens = $4, finished_at = NOW()
                 WHERE id = $1`,
                [run.id, JSON.stringify(output), result.inputTokens, result.outputTokens],
            );
        } else {
            await db.query(
                `UPDATE enrichment_runs SET status = 'skipped', error = 'ANTHROPIC_API_KEY unset', finished_at = NOW() WHERE id = $1`,
                [run.id],
            );
        }
    } catch (err) {
        await db.query(
            `UPDATE enrichment_runs SET status = 'failed', error = $2, finished_at = NOW() WHERE id = $1`,
            [run.id, (err as Error).message],
        );
        throw err;
    }

    // ── License lookup ──────────────────────────────────────────────────────
    const states = new Set<string>(
        [...(output?.states ?? []), context?.state ?? ''].map(s => s.trim().toUpperCase()).filter(s => s.length === 2),
    );
    const foundNumbers = output?.license_numbers ?? [];
    const relevant = states.size ? sources.filter(s => states.has(s.state)) : sources;
    const matched: LicenseRecord[] = [];
    for (const source of relevant) {
        try {
            matched.push(...await source.search({
                names: [org.name],
                licenseNumbers: foundNumbers.filter(l => l.state.toUpperCase() === source.state).map(l => l.license_number),
            }));
        } catch (err) {
            console.error(`[enrich] ${source.state} license lookup failed:`, (err as Error).message);
        }
    }
    // Numbers Claude saw but no configured registry confirmed are kept, marked unverified.
    const verified = new Set(matched.map(l => `${l.state}:${l.licenseNumber.toUpperCase()}`));
    for (const l of foundNumbers) {
        const state = l.state.toUpperCase();
        if (verified.has(`${state}:${l.license_number.toUpperCase()}`)) continue;
        matched.push({
            state, licenseNumber: l.license_number, licenseType: null, status: 'unverified', legalName: null, dba: null,
            city: null, expiresOn: null, source: 'claude_research', raw: null,
        });
    }
    for (const l of matched) {
        await db.query(
            `INSERT INTO licenses (organization_id, state, license_number, license_type, status, legal_name, dba, city, expires_on, source, raw)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (state, license_number) DO UPDATE SET
                organization_id = COALESCE(licenses.organization_id, EXCLUDED.organization_id),
                license_type = COALESCE(EXCLUDED.license_type, licenses.license_type),
                status = CASE WHEN EXCLUDED.source = 'claude_research' THEN licenses.status ELSE EXCLUDED.status END,
                legal_name = COALESCE(EXCLUDED.legal_name, licenses.legal_name),
                dba = COALESCE(EXCLUDED.dba, licenses.dba),
                city = COALESCE(EXCLUDED.city, licenses.city),
                expires_on = COALESCE(EXCLUDED.expires_on, licenses.expires_on),
                source = CASE WHEN EXCLUDED.source = 'claude_research' THEN licenses.source ELSE EXCLUDED.source END,
                raw = COALESCE(EXCLUDED.raw, licenses.raw),
                fetched_at = NOW()`,
            [organizationId, l.state, l.licenseNumber, l.licenseType, l.status, l.legalName, l.dba, l.city, l.expiresOn, l.source,
                l.raw === null ? null : JSON.stringify(l.raw)],
        );
    }

    if (!output && matched.length === 0) {
        return { status: 'skipped', reason: 'no enrichment providers configured' };
    }

    await db.query(
        `UPDATE organizations SET
            enrichment = COALESCE($2::jsonb, enrichment),
            fit_score = COALESCE($3, fit_score),
            enriched_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [organizationId, output ? JSON.stringify(output) : null, output?.fit_score ?? null],
    );
    await logActivity(db, {
        organizationId, personId: null, type: 'enriched',
        data: { fitScore: output?.fit_score ?? null, licenses: matched.length },
    });
    await enqueue(db, 'sync_to_attio', { organizationId }, { jobKey: `attio:${organizationId}` });
    return { status: 'enriched', fitScore: output?.fit_score ?? null, licenses: matched.length };
}
