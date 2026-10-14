import type { Queryable } from './db';
import { companyDomain, type DemoRequestInput } from './demoRequest';
import { enqueue } from './jobs';

export interface RequestMeta {
    ipHash: string | null;
    userAgent: string | null;
}

export interface CreatedDemoRequest {
    demoRequestId: string;
    personId: string;
    organizationId: string;
}

/** Demo requests allowed per IP hash per hour before we start refusing. */
export const DEMO_REQUESTS_PER_HOUR = 5;

export async function countRecentDemoRequests(db: Queryable, ipHash: string): Promise<number> {
    const { rows } = await db.query(
        `SELECT COUNT(*)::int AS n FROM demo_requests WHERE ip_hash = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
        [ipHash],
    );
    return rows[0].n;
}

export async function logActivity(
    db: Queryable,
    a: { organizationId: string | null; personId: string | null; type: string; data?: unknown },
) {
    await db.query(
        `INSERT INTO activities (organization_id, person_id, type, data) VALUES ($1, $2, $3, $4)`,
        [a.organizationId, a.personId, a.type, a.data === undefined ? null : JSON.stringify(a.data)],
    );
}

/**
 * Record a demo request: upsert organization + person, insert the request, a
 * form message and an activity, and enqueue follow-up jobs. Call inside a
 * transaction so the jobs only exist if the data committed.
 */
export async function createDemoRequest(db: Queryable, input: DemoRequestInput, meta: RequestMeta): Promise<CreatedDemoRequest> {
    const domain = companyDomain(input.email);

    const existing = await db.query(`SELECT id, organization_id FROM people WHERE email = $1`, [input.email]);
    let organizationId: string | null = existing.rows[0]?.organization_id ?? null;

    if (domain) {
        // A work domain identifies the company, even if this person was linked elsewhere before.
        const { rows } = await db.query(
            `INSERT INTO organizations (name, domain) VALUES ($1, $2)
             ON CONFLICT (domain) DO UPDATE SET updated_at = NOW()
             RETURNING id`,
            [input.company, domain],
        );
        organizationId = rows[0].id;
    } else if (!organizationId) {
        const { rows } = await db.query(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [input.company]);
        organizationId = rows[0].id;
    }

    // Move early-stage orgs into the demo stage; never demote customers.
    await db.query(
        `UPDATE organizations SET stage = 'demo', updated_at = NOW() WHERE id = $1 AND stage IN ('lead', 'qualified')`,
        [organizationId],
    );

    const person = await db.query(
        `INSERT INTO people (email, name, role, phone, organization_id) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE SET
            name = EXCLUDED.name,
            role = COALESCE(EXCLUDED.role, people.role),
            phone = COALESCE(EXCLUDED.phone, people.phone),
            organization_id = EXCLUDED.organization_id,
            updated_at = NOW()
         RETURNING id`,
        [input.email, input.name, input.role, input.phone, organizationId],
    );
    const personId: string = person.rows[0].id;

    const request = await db.query(
        `INSERT INTO demo_requests (
            person_id, organization_id, company_name, state, operation_type, facility_size, current_tools, message,
            source, utm_source, utm_medium, utm_campaign, referrer, ip_hash, user_agent
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id`,
        [
            personId, organizationId, input.company, input.state, input.operationType, input.facilitySize,
            input.currentTools, input.message, input.source, input.utmSource, input.utmMedium, input.utmCampaign,
            input.referrer, meta.ipHash, meta.userAgent,
        ],
    );
    const demoRequestId: string = request.rows[0].id;

    if (input.message) {
        const convo = await db.query(
            `INSERT INTO conversations (organization_id, person_id, subject, channel) VALUES ($1, $2, $3, 'form') RETURNING id`,
            [organizationId, personId, 'Demo request'],
        );
        await db.query(
            `INSERT INTO messages (conversation_id, kind, direction, author, body, metadata)
             VALUES ($1, 'form', 'inbound', $2, $3, $4)`,
            [convo.rows[0].id, input.email, input.message, JSON.stringify({ demoRequestId })],
        );
    }

    await logActivity(db, {
        organizationId, personId, type: 'demo_requested',
        data: { demoRequestId, source: input.source, utmSource: input.utmSource, utmCampaign: input.utmCampaign },
    });

    await enqueue(db, 'notify_demo_request', { demoRequestId });
    await enqueue(db, 'send_demo_confirmation', { demoRequestId });
    // Job keys collapse repeat submissions into one pending enrichment / sync per org.
    await enqueue(db, 'enrich_organization', { organizationId: organizationId! }, { jobKey: `enrich:${organizationId}` });
    await enqueue(db, 'sync_to_attio', { organizationId: organizationId! }, { jobKey: `attio:${organizationId}` });

    return { demoRequestId, personId, organizationId: organizationId! };
}

/** Everything about one demo request, joined, for emails and sync. */
export async function getDemoRequestDetail(db: Queryable, demoRequestId: string) {
    const { rows } = await db.query(
        `SELECT dr.*, p.name AS person_name, p.email AS person_email, p.role AS person_role, p.phone AS person_phone,
                o.name AS organization_name, o.domain AS organization_domain
         FROM demo_requests dr
         JOIN people p ON p.id = dr.person_id
         LEFT JOIN organizations o ON o.id = dr.organization_id
         WHERE dr.id = $1`,
        [demoRequestId],
    );
    return rows[0] ?? null;
}

/** Prefill name + email on Cal.com / Calendly booking links (both accept these params). */
export function prefilledSchedulingUrl(base: string | null, name: string, email: string): string | null {
    if (!base) return null;
    try {
        const url = new URL(base);
        url.searchParams.set('name', name);
        url.searchParams.set('email', email);
        return url.toString();
    } catch {
        return base;
    }
}
