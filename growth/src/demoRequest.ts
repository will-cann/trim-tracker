import {
    DEMO_FIELD_LIMITS as L,
    FACILITY_SIZES,
    OPERATION_TYPES,
    type FacilitySize,
    type OperationType,
} from '../../shared/growth/demoRequest';

/**
 * Validation for public "Book a Demo" submissions (POST /v1/demo-requests).
 * The options and limits come from shared/growth/demoRequest.ts, the same
 * module the website form renders from. Free of I/O so it's unit-testable.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Freemail domains can't identify a company, so they don't get an organizations.domain. */
const FREEMAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
    'msn.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me',
    'gmx.com', 'ymail.com', 'comcast.net', 'att.net', 'verizon.net',
]);

export interface DemoRequestInput {
    name: string;
    email: string;
    company: string;
    role: string | null;
    phone: string | null;
    state: string | null;
    operationType: OperationType | null;
    facilitySize: FacilitySize | null;
    currentTools: string | null;
    message: string | null;
    source: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    referrer: string | null;
}

export type DemoRequestValidation =
    | { ok: true; value: DemoRequestInput }
    /** `spam` = honeypot tripped: respond as if it succeeded and store nothing. */
    | { ok: false; spam: true }
    | { ok: false; spam: false; error: string };

function str(v: unknown, max: number): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim().replace(/\s+/g, ' ');
    return t ? t.slice(0, max) : null;
}

function multiline(v: unknown, max: number): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
    return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

export function validateDemoRequest(body: unknown): DemoRequestValidation {
    if (!body || typeof body !== 'object') return { ok: false, spam: false, error: 'Invalid request body' };
    const b = body as Record<string, unknown>;

    // Honeypot: a field real visitors never see. Bots fill every input.
    if (typeof b.website === 'string' && b.website.trim() !== '') return { ok: false, spam: true };

    const name = str(b.name, L.name);
    const email = str(b.email, L.email)?.toLowerCase() ?? null;
    const company = str(b.company, L.company);

    if (!name) return { ok: false, spam: false, error: 'Please add your name.' };
    if (!email || !EMAIL_RE.test(email)) return { ok: false, spam: false, error: 'Please add a valid email address.' };
    if (!company) return { ok: false, spam: false, error: 'Please add your company name.' };

    return {
        ok: true,
        value: {
            name,
            email,
            company,
            role: str(b.role, L.role),
            phone: str(b.phone, L.phone),
            state: str(b.state, L.state),
            operationType: oneOf(b.operationType, OPERATION_TYPES),
            facilitySize: oneOf(b.facilitySize, FACILITY_SIZES),
            currentTools: str(b.currentTools, L.currentTools),
            message: multiline(b.message, L.message),
            source: str(b.source, L.source),
            utmSource: str(b.utmSource, L.utm),
            utmMedium: str(b.utmMedium, L.utm),
            utmCampaign: str(b.utmCampaign, L.utm),
            referrer: str(b.referrer, L.referrer),
        },
    };
}

/** Company domain from a work email, or null for freemail / unparseable addresses. */
export function companyDomain(email: string): string | null {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain || FREEMAIL_DOMAINS.has(domain)) return null;
    return domain;
}
