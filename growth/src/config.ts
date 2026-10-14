import 'dotenv/config';

/** All environment configuration in one place. Read lazily so tests can set env per case. */
export const config = {
    get port() { return Number(process.env.PORT || 8787); },
    get databaseUrl() { return process.env.DATABASE_URL; },
    /** Comma-separated bearer keys for /mcp and the CLI. */
    get apiKeys() { return (process.env.GROWTH_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean); },
    get ipHashSalt() { return process.env.IP_HASH_SALT || 'neurocann-growth'; },
    get sendgridApiKey() { return process.env.SENDGRID_API_KEY; },
    get sendgridFromEmail() { return process.env.SENDGRID_FROM_EMAIL || 'hello@neurocann.app'; },
    get demoNotifyEmail() { return process.env.DEMO_NOTIFY_EMAIL || 'will@neurocann.app'; },
    /** Cal.com / Calendly booking link. Prospects get it prefilled with name + email. */
    get demoSchedulingUrl() { return process.env.DEMO_SCHEDULING_URL || null; },
    get attioApiKey() { return process.env.ATTIO_API_KEY || null; },
    /** Slug of the Attio list demo requests are added to. */
    get attioDemoListSlug() { return process.env.ATTIO_DEMO_LIST || null; },
    get anthropicApiKey() { return process.env.ANTHROPIC_API_KEY || null; },
    get enrichModel() { return process.env.ENRICH_MODEL || 'claude-opus-5-5'; },
    /** Set to 'false' to run the HTTP server without the job worker (e.g. a second replica). */
    get runWorker() { return process.env.RUN_WORKER !== 'false'; },
};
