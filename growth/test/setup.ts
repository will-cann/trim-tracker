// Tests never send real email or call external APIs.
process.env.SENDGRID_API_KEY = 'stub';
delete process.env.ATTIO_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.LICENSE_SOURCES;
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://growth:growth@localhost/growth_test';
process.env.GROWTH_API_KEYS = 'test-key';
