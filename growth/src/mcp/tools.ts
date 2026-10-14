import { getPool, type Queryable } from '../db';
import { enqueue } from '../jobs';
import { logActivity } from '../prospects';

/**
 * Growth MCP tools. Every tool is private (bearer GROWTH_API_KEYS). Writes are
 * limited to pipeline bookkeeping; anything slow (enrichment, Attio) is queued.
 */

export class ToolInputError extends Error {}

export interface ToolDefinition {
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
}

export interface RegisteredTool {
    definition: ToolDefinition;
    handler: (db: Queryable, args: Record<string, any>) => Promise<unknown>;
}

const DEMO_STATUSES = ['requested', 'scheduled', 'completed', 'no_show', 'canceled'];
const STAGES = ['lead', 'qualified', 'demo', 'trial', 'customer', 'churned', 'disqualified'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const orgSelector = {
    organization_id: { type: 'string', description: 'Organization UUID' },
    domain: { type: 'string', description: 'Company email/web domain, e.g. acmefarms.com' },
    email: { type: 'string', description: 'Email of anyone at the organization' },
};

function str(v: unknown): string | null {
    return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function limitArg(v: unknown, def: number, max: number): number {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : def;
}

/** Resolve an organization from organization_id, domain or a person's email. */
export async function resolveOrganizationId(db: Queryable, args: Record<string, any>): Promise<string> {
    const id = str(args.organization_id);
    if (id) {
        if (!UUID_RE.test(id)) throw new ToolInputError('organization_id must be a UUID');
        const { rows } = await db.query(`SELECT id FROM organizations WHERE id = $1`, [id]);
        if (rows[0]) return rows[0].id;
        throw new ToolInputError(`No organization with id ${id}`);
    }
    const domain = str(args.domain)?.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (domain) {
        const { rows } = await db.query(`SELECT id FROM organizations WHERE domain = $1`, [domain]);
        if (rows[0]) return rows[0].id;
        throw new ToolInputError(`No organization with domain ${domain}`);
    }
    const email = str(args.email)?.toLowerCase();
    if (email) {
        const { rows } = await db.query(`SELECT organization_id FROM people WHERE email = $1`, [email]);
        if (rows[0]?.organization_id) return rows[0].organization_id;
        throw new ToolInputError(`No prospect with email ${email}`);
    }
    throw new ToolInputError('Pass organization_id, domain or email');
}

const TOOLS: RegisteredTool[] = [
    {
        definition: {
            name: 'pipeline_summary',
            title: 'Pipeline summary',
            description: 'Counts of organizations by stage and demo requests by status, plus recent demo-request volume and average fit score.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            annotations: { readOnlyHint: true },
        },
        async handler(db) {
            const stages = await db.query(`SELECT stage, COUNT(*)::int AS n FROM organizations GROUP BY stage ORDER BY stage`);
            const statuses = await db.query(`SELECT status, COUNT(*)::int AS n FROM demo_requests GROUP BY status ORDER BY status`);
            const { rows: [recent] } = await db.query(
                `SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS last_7_days,
                        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS last_30_days
                 FROM demo_requests`,
            );
            const { rows: [fit] } = await db.query(
                `SELECT ROUND(AVG(fit_score))::int AS avg_fit, COUNT(fit_score)::int AS scored FROM organizations`,
            );
            return {
                organizations_by_stage: Object.fromEntries(stages.rows.map(r => [r.stage, r.n])),
                demo_requests_by_status: Object.fromEntries(statuses.rows.map(r => [r.status, r.n])),
                demo_requests_last_7_days: recent.last_7_days,
                demo_requests_last_30_days: recent.last_30_days,
                average_fit_score: fit.avg_fit,
                scored_organizations: fit.scored,
            };
        },
    },
    {
        definition: {
            name: 'list_demo_requests',
            title: 'List demo requests',
            description: 'Demo requests, newest first, with contact, company, fit score and status.',
            inputSchema: {
                type: 'object',
                properties: {
                    status: { type: 'string', enum: DEMO_STATUSES },
                    since_days: { type: 'integer', description: 'Only requests from the last N days' },
                    limit: { type: 'integer', description: 'Default 25, max 200' },
                },
                additionalProperties: false,
            },
            annotations: { readOnlyHint: true },
        },
        async handler(db, args) {
            const status = str(args.status);
            if (status && !DEMO_STATUSES.includes(status)) throw new ToolInputError(`status must be one of ${DEMO_STATUSES.join(', ')}`);
            const sinceDays = args.since_days === undefined ? null : limitArg(args.since_days, 30, 3650);
            const { rows } = await db.query(
                `SELECT dr.id, dr.status, dr.created_at, dr.scheduled_at, dr.company_name, dr.state, dr.operation_type,
                        dr.facility_size, dr.source, p.name, p.email, p.role, o.id AS organization_id, o.domain, o.fit_score, o.stage
                 FROM demo_requests dr
                 JOIN people p ON p.id = dr.person_id
                 LEFT JOIN organizations o ON o.id = dr.organization_id
                 WHERE ($1::text IS NULL OR dr.status = $1)
                   AND ($2::int IS NULL OR dr.created_at > NOW() - make_interval(days => $2))
                 ORDER BY dr.created_at DESC
                 LIMIT $3`,
                [status, sinceDays, limitArg(args.limit, 25, 200)],
            );
            return { demo_requests: rows };
        },
    },
    {
        definition: {
            name: 'update_demo_request',
            title: 'Update demo request',
            description: 'Set a demo request\'s status (requested, scheduled, completed, no_show, canceled) and/or its scheduled time.',
            inputSchema: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'Demo request UUID' },
                    status: { type: 'string', enum: DEMO_STATUSES },
                    scheduled_at: { type: 'string', description: 'ISO 8601 date-time' },
                },
                required: ['id'],
                additionalProperties: false,
            },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        },
        async handler(db, args) {
            const id = str(args.id);
            if (!id || !UUID_RE.test(id)) throw new ToolInputError('id must be a demo request UUID');
            const status = str(args.status);
            if (status && !DEMO_STATUSES.includes(status)) throw new ToolInputError(`status must be one of ${DEMO_STATUSES.join(', ')}`);
            const scheduledRaw = str(args.scheduled_at);
            const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : null;
            if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw new ToolInputError('scheduled_at must be an ISO 8601 date-time');
            if (!status && !scheduledAt) throw new ToolInputError('Pass status and/or scheduled_at');

            const { rows } = await db.query(
                `UPDATE demo_requests SET
                    status = COALESCE($2, CASE WHEN $3::timestamptz IS NOT NULL AND status = 'requested' THEN 'scheduled' ELSE status END),
                    scheduled_at = COALESCE($3, scheduled_at),
                    updated_at = NOW()
                 WHERE id = $1
                 RETURNING id, status, scheduled_at, person_id, organization_id`,
                [id, status, scheduledAt],
            );
            if (!rows[0]) throw new ToolInputError(`No demo request with id ${id}`);
            const r = rows[0];
            await logActivity(db, {
                organizationId: r.organization_id, personId: r.person_id, type: 'demo_request_updated',
                data: { demoRequestId: id, status: r.status, scheduledAt: r.scheduled_at },
            });
            if (r.organization_id) await enqueue(db, 'sync_to_attio', { organizationId: r.organization_id }, { jobKey: `attio:${r.organization_id}` });
            return { id: r.id, status: r.status, scheduled_at: r.scheduled_at };
        },
    },
    {
        definition: {
            name: 'search_prospects',
            title: 'Search prospects',
            description: 'Find organizations by company name, domain, or a contact\'s name/email. Optionally filter by stage.',
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Substring of company name, domain, person name or email' },
                    stage: { type: 'string', enum: STAGES },
                    limit: { type: 'integer', description: 'Default 20, max 100' },
                },
                additionalProperties: false,
            },
            annotations: { readOnlyHint: true },
        },
        async handler(db, args) {
            const stage = str(args.stage);
            if (stage && !STAGES.includes(stage)) throw new ToolInputError(`stage must be one of ${STAGES.join(', ')}`);
            const q = str(args.query);
            const like = q ? `%${q.replace(/[\\%_]/g, m => `\\${m}`)}%` : null;
            const { rows } = await db.query(
                `SELECT o.id, o.name, o.domain, o.stage, o.fit_score, o.updated_at,
                        COALESCE(json_agg(json_build_object('name', p.name, 'email', p.email, 'role', p.role))
                                 FILTER (WHERE p.id IS NOT NULL), '[]') AS people
                 FROM organizations o
                 LEFT JOIN people p ON p.organization_id = o.id
                 WHERE ($1::text IS NULL OR o.stage = $1)
                   AND ($2::text IS NULL OR o.name ILIKE $2 OR o.domain ILIKE $2 OR EXISTS (
                        SELECT 1 FROM people px WHERE px.organization_id = o.id AND (px.name ILIKE $2 OR px.email ILIKE $2)))
                 GROUP BY o.id
                 ORDER BY o.updated_at DESC
                 LIMIT $3`,
                [stage, like, limitArg(args.limit, 20, 100)],
            );
            return { organizations: rows };
        },
    },
    {
        definition: {
            name: 'get_prospect',
            title: 'Get prospect',
            description: 'Everything about one organization: people, demo requests, enrichment (summary, fit score, sources), licenses, notes and recent timeline.',
            inputSchema: { type: 'object', properties: orgSelector, additionalProperties: false },
            annotations: { readOnlyHint: true },
        },
        async handler(db, args) {
            const id = await resolveOrganizationId(db, args);
            const [org, people, demos, licenses, runs, messages, activities] = await Promise.all([
                db.query(`SELECT * FROM organizations WHERE id = $1`, [id]),
                db.query(`SELECT id, name, email, role, phone, attio_record_id, created_at FROM people WHERE organization_id = $1 ORDER BY created_at`, [id]),
                db.query(`SELECT id, status, created_at, scheduled_at, state, operation_type, facility_size, current_tools, message, source, utm_source, utm_campaign
                          FROM demo_requests WHERE organization_id = $1 ORDER BY created_at DESC`, [id]),
                db.query(`SELECT state, license_number, license_type, status, legal_name, dba, city, expires_on, source FROM licenses WHERE organization_id = $1 ORDER BY state, license_number`, [id]),
                db.query(`SELECT provider, status, error, started_at, finished_at, input_tokens, output_tokens FROM enrichment_runs WHERE organization_id = $1 ORDER BY started_at DESC LIMIT 5`, [id]),
                db.query(`SELECT m.kind, m.direction, m.author, m.body, m.occurred_at FROM messages m JOIN conversations c ON c.id = m.conversation_id
                          WHERE c.organization_id = $1 ORDER BY m.occurred_at DESC LIMIT 20`, [id]),
                db.query(`SELECT type, data, created_at FROM activities WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 50`, [id]),
            ]);
            return {
                organization: org.rows[0],
                people: people.rows,
                demo_requests: demos.rows,
                licenses: licenses.rows,
                enrichment_runs: runs.rows,
                notes: messages.rows,
                timeline: activities.rows,
            };
        },
    },
    {
        definition: {
            name: 'update_organization',
            title: 'Update organization',
            description: 'Move an organization to a pipeline stage (lead, qualified, demo, trial, customer, churned, disqualified) and/or rename it.',
            inputSchema: {
                type: 'object',
                properties: { ...orgSelector, stage: { type: 'string', enum: STAGES }, name: { type: 'string' } },
                additionalProperties: false,
            },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        },
        async handler(db, args) {
            const id = await resolveOrganizationId(db, args);
            const stage = str(args.stage);
            if (stage && !STAGES.includes(stage)) throw new ToolInputError(`stage must be one of ${STAGES.join(', ')}`);
            const name = str(args.name);
            if (!stage && !name) throw new ToolInputError('Pass stage and/or name');
            const { rows: [org] } = await db.query(
                `UPDATE organizations SET stage = COALESCE($2, stage), name = COALESCE($3, name), updated_at = NOW()
                 WHERE id = $1 RETURNING id, name, stage`,
                [id, stage, name],
            );
            await logActivity(db, { organizationId: id, personId: null, type: 'organization_updated', data: { stage, name } });
            await enqueue(db, 'sync_to_attio', { organizationId: id }, { jobKey: `attio:${id}` });
            return org;
        },
    },
    {
        definition: {
            name: 'log_note',
            title: 'Log a note',
            description: 'Record call or demo notes against an organization (and optionally a person). Synced to Attio as a note.',
            inputSchema: {
                type: 'object',
                properties: {
                    ...orgSelector,
                    kind: { type: 'string', enum: ['call_note', 'demo_note'] },
                    body: { type: 'string', description: 'The notes (plain text or Markdown)' },
                    subject: { type: 'string' },
                    occurred_at: { type: 'string', description: 'ISO 8601; defaults to now' },
                },
                required: ['kind', 'body'],
                additionalProperties: false,
            },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
        },
        async handler(db, args) {
            const id = await resolveOrganizationId(db, args);
            const kind = str(args.kind);
            if (kind !== 'call_note' && kind !== 'demo_note') throw new ToolInputError('kind must be call_note or demo_note');
            const body = typeof args.body === 'string' ? args.body.trim() : '';
            if (!body) throw new ToolInputError('body is required');
            const occurredRaw = str(args.occurred_at);
            const occurredAt = occurredRaw ? new Date(occurredRaw) : new Date();
            if (Number.isNaN(occurredAt.getTime())) throw new ToolInputError('occurred_at must be an ISO 8601 date-time');
            const email = str(args.email)?.toLowerCase() ?? null;
            const person = email ? (await db.query(`SELECT id FROM people WHERE email = $1`, [email])).rows[0] : null;

            const { rows: [convo] } = await db.query(
                `INSERT INTO conversations (organization_id, person_id, subject, channel) VALUES ($1, $2, $3, $4) RETURNING id`,
                [id, person?.id ?? null, str(args.subject) ?? (kind === 'call_note' ? 'Call' : 'Demo'), kind === 'call_note' ? 'call' : 'other'],
            );
            const { rows: [msg] } = await db.query(
                `INSERT INTO messages (conversation_id, kind, direction, author, body, occurred_at)
                 VALUES ($1, $2, 'internal', 'growth-mcp', $3, $4) RETURNING id`,
                [convo.id, kind, body, occurredAt],
            );
            await logActivity(db, { organizationId: id, personId: person?.id ?? null, type: kind, data: { messageId: msg.id } });
            await enqueue(db, 'sync_to_attio', { organizationId: id }, { jobKey: `attio:${id}` });
            return { message_id: msg.id, conversation_id: convo.id };
        },
    },
    {
        definition: {
            name: 'enrich_organization',
            title: 'Enrich organization',
            description: 'Queue Claude web research + state license lookup for an organization. Results appear in get_prospect within a few minutes.',
            inputSchema: {
                type: 'object',
                properties: { ...orgSelector, force: { type: 'boolean', description: 'Re-run even if enriched in the last 30 days' } },
                additionalProperties: false,
            },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        },
        async handler(db, args) {
            const id = await resolveOrganizationId(db, args);
            await enqueue(db, 'enrich_organization', { organizationId: id, force: args.force === true }, { jobKey: `enrich:${id}` });
            return { queued: true, organization_id: id };
        },
    },
    {
        definition: {
            name: 'sync_to_attio',
            title: 'Sync to Attio',
            description: 'Queue a push of an organization (company, people, demo list entries, notes, enrichment) to Attio.',
            inputSchema: { type: 'object', properties: orgSelector, additionalProperties: false },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        },
        async handler(db, args) {
            const id = await resolveOrganizationId(db, args);
            await enqueue(db, 'sync_to_attio', { organizationId: id }, { jobKey: `attio:${id}` });
            return { queued: true, organization_id: id };
        },
    },
];

export function listTools(): ToolDefinition[] {
    return TOOLS.map(t => t.definition);
}

export function findTool(name: string): RegisteredTool | undefined {
    return TOOLS.find(t => t.definition.name === name);
}

export function defaultDb(): Queryable {
    return getPool();
}
