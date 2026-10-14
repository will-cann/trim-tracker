import { config } from './config';
import type { Queryable } from './db';

/**
 * Attio v2 client + one-way sync (growth DB → Attio).
 *
 * Every Attio payload shape lives in this file so it can be adjusted in one
 * place if a workspace's attribute slugs differ. Sync is idempotent: record,
 * entry and note IDs are stored locally and reused.
 *
 *   companies  PUT  /v2/objects/companies/records?matching_attribute=domains
 *   people     PUT  /v2/objects/people/records?matching_attribute=email_addresses
 *   list entry PUT  /v2/lists/{list}/entries            (only if ATTIO_DEMO_LIST is set)
 *   notes      POST /v2/notes
 */

const BASE_URL = 'https://api.attio.com/v2';

export class AttioError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

type FetchFn = typeof fetch;

export class AttioClient {
    constructor(private apiKey: string, private fetchFn: FetchFn = fetch) {}

    private async request(method: string, path: string, body?: unknown): Promise<any> {
        const res = await this.fetchFn(`${BASE_URL}${path}`, {
            method,
            headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        if (!res.ok) throw new AttioError(res.status, `Attio ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
        return text ? JSON.parse(text) : null;
    }

    async assertCompany(values: CompanyValues, existingRecordId: string | null): Promise<string> {
        const payload = { data: { values: companyAttioValues(values) } };
        let res;
        if (values.domain) {
            res = await this.request('PUT', '/objects/companies/records?matching_attribute=domains', payload);
        } else if (existingRecordId) {
            res = await this.request('PATCH', `/objects/companies/records/${existingRecordId}`, payload);
        } else {
            // No domain (freemail sign-up): nothing unique to match on, so create once and remember the id.
            res = await this.request('POST', '/objects/companies/records', payload);
        }
        return res.data.id.record_id;
    }

    async assertPerson(values: PersonValues, companyRecordId: string | null): Promise<string> {
        const res = await this.request('PUT', '/objects/people/records?matching_attribute=email_addresses', {
            data: { values: personAttioValues(values, companyRecordId) },
        });
        return res.data.id.record_id;
    }

    async assertCompanyListEntry(list: string, companyRecordId: string): Promise<string> {
        const res = await this.request('PUT', `/lists/${encodeURIComponent(list)}/entries`, {
            data: { parent_record_id: companyRecordId, parent_object: 'companies', entry_values: {} },
        });
        return res.data.id.entry_id;
    }

    async createNote(parentObject: 'companies' | 'people', parentRecordId: string, title: string, content: string): Promise<string> {
        const res = await this.request('POST', '/notes', {
            data: { parent_object: parentObject, parent_record_id: parentRecordId, title, format: 'plaintext', content },
        });
        return res.data.id.note_id;
    }
}

export interface CompanyValues {
    name: string;
    domain: string | null;
}

export interface PersonValues {
    name: string;
    email: string;
    role: string | null;
}

export function companyAttioValues(v: CompanyValues): Record<string, unknown> {
    const values: Record<string, unknown> = { name: v.name };
    if (v.domain) values.domains = [v.domain];
    return values;
}

export function personAttioValues(v: PersonValues, companyRecordId: string | null): Record<string, unknown> {
    const [first, ...rest] = v.name.split(' ');
    const values: Record<string, unknown> = {
        email_addresses: [v.email],
        name: [{ first_name: first, last_name: rest.join(' '), full_name: v.name }],
    };
    if (v.role) values.job_title = v.role;
    if (companyRecordId) values.company = [{ target_object: 'companies', target_record_id: companyRecordId }];
    return values;
}

export function enrichmentNoteContent(output: any, licenses: Array<Record<string, any>>): string {
    const lines: string[] = [];
    if (output?.summary) lines.push(output.summary, '');
    if (typeof output?.fit_score === 'number') lines.push(`Fit score: ${output.fit_score}/100`);
    for (const r of output?.fit_reasons ?? []) lines.push(`  - ${r}`);
    if (output?.operation_types?.length) lines.push(`Operation: ${output.operation_types.join(', ')}`);
    if (output?.states?.length) lines.push(`States: ${output.states.join(', ')}`);
    if (output?.estimated_canopy) lines.push(`Estimated canopy: ${output.estimated_canopy}`);
    if (licenses.length) {
        lines.push('', 'Licenses:');
        for (const l of licenses) {
            lines.push(`  - ${l.state} ${l.license_number} ${l.license_type ?? ''} ${l.status ? `(${l.status})` : ''}`.trimEnd());
        }
    }
    if (output?.sources?.length) {
        lines.push('', 'Sources:');
        for (const s of output.sources) lines.push(`  - ${s}`);
    }
    return lines.join('\n').trim();
}

export function attioClient(fetchFn?: FetchFn): AttioClient | null {
    return config.attioApiKey ? new AttioClient(config.attioApiKey, fetchFn) : null;
}

/**
 * Push one organization (company, its people, demo-request list entries,
 * form messages and enrichment notes) to Attio. Returns false when Attio
 * isn't configured. Throws on API errors so the job retries.
 */
export async function syncOrganizationToAttio(db: Queryable, organizationId: string, client = attioClient()): Promise<boolean> {
    if (!client) {
        console.log('[attio] ATTIO_API_KEY unset; skipping sync for', organizationId);
        return false;
    }
    const { rows: [org] } = await db.query(`SELECT * FROM organizations WHERE id = $1`, [organizationId]);
    if (!org) return false;

    try {
        const companyId = await client.assertCompany({ name: org.name, domain: org.domain }, org.attio_record_id);
        await db.query(`UPDATE organizations SET attio_record_id = $2 WHERE id = $1`, [organizationId, companyId]);

        const { rows: people } = await db.query(`SELECT * FROM people WHERE organization_id = $1`, [organizationId]);
        for (const p of people) {
            const personId = await client.assertPerson({ name: p.name, email: p.email, role: p.role }, companyId);
            if (personId !== p.attio_record_id) {
                await db.query(`UPDATE people SET attio_record_id = $2 WHERE id = $1`, [p.id, personId]);
            }
        }

        const list = config.attioDemoListSlug;
        if (list) {
            const { rows: requests } = await db.query(
                `SELECT id FROM demo_requests WHERE organization_id = $1 AND attio_entry_id IS NULL`, [organizationId],
            );
            for (const r of requests) {
                const entryId = await client.assertCompanyListEntry(list, companyId);
                await db.query(`UPDATE demo_requests SET attio_entry_id = $2 WHERE id = $1`, [r.id, entryId]);
            }
        }

        const { rows: messages } = await db.query(
            `SELECT m.*, p.name AS person_name
             FROM messages m
             JOIN conversations c ON c.id = m.conversation_id
             LEFT JOIN people p ON p.id = c.person_id
             WHERE c.organization_id = $1 AND m.attio_note_id IS NULL
             ORDER BY m.occurred_at`,
            [organizationId],
        );
        for (const m of messages) {
            const title = noteTitle(m.kind, m.person_name);
            const noteId = await client.createNote('companies', companyId, title, m.body);
            await db.query(`UPDATE messages SET attio_note_id = $2 WHERE id = $1`, [m.id, noteId]);
        }

        const { rows: runs } = await db.query(
            `SELECT * FROM enrichment_runs
             WHERE organization_id = $1 AND status = 'succeeded' AND attio_note_id IS NULL
             ORDER BY started_at DESC LIMIT 1`,
            [organizationId],
        );
        if (runs[0]) {
            const { rows: licenses } = await db.query(`SELECT * FROM licenses WHERE organization_id = $1`, [organizationId]);
            const content = enrichmentNoteContent(runs[0].output, licenses);
            if (content) {
                const noteId = await client.createNote('companies', companyId, 'NeuroCann enrichment', content);
                await db.query(`UPDATE enrichment_runs SET attio_note_id = $2 WHERE id = $1`, [runs[0].id, noteId]);
            }
        }

        await db.query(
            `UPDATE organizations SET attio_synced_at = NOW(), attio_sync_error = NULL WHERE id = $1`, [organizationId],
        );
        return true;
    } catch (err) {
        await db.query(`UPDATE organizations SET attio_sync_error = $2 WHERE id = $1`, [organizationId, (err as Error).message]);
        throw err;
    }
}

function noteTitle(kind: string, personName: string | null): string {
    const who = personName ? ` from ${personName}` : '';
    switch (kind) {
        case 'form': return `Demo request${who}`;
        case 'call_note': return `Call notes${who}`;
        case 'demo_note': return `Demo notes${who}`;
        default: return `Email${who}`;
    }
}
