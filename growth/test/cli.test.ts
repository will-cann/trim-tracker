import { describe, expect, it } from 'vitest';
import { parseArgs, resolveCommand, selector } from '../bin/growth';

describe('growth CLI', () => {
    it('parses flags and positionals', () => {
        expect(parseArgs(['demos', 'list', '--status', 'requested', '--force'])).toEqual({
            positional: ['demos', 'list'], flags: { status: 'requested', force: true },
        });
    });

    it('picks the selector type from the value', () => {
        expect(selector('a@b.co')).toEqual({ email: 'a@b.co' });
        expect(selector('acme.com')).toEqual({ domain: 'acme.com' });
        expect(selector('64c08768-3849-4a42-93b1-da50055b3f75')).toEqual({ organization_id: '64c08768-3849-4a42-93b1-da50055b3f75' });
    });

    it('maps commands to MCP tools', async () => {
        expect(await resolveCommand(['summary'])).toEqual(['pipeline_summary', {}]);
        expect(await resolveCommand(['demos', 'list', '--since', '7'])).toEqual(['list_demo_requests', { since_days: 7 }]);
        expect(await resolveCommand(['demos', 'update', 'id-1', '--status', 'completed'])).toEqual(['update_demo_request', { id: 'id-1', status: 'completed' }]);
        expect(await resolveCommand(['prospect', 'get', 'acme.com'])).toEqual(['get_prospect', { domain: 'acme.com' }]);
        expect(await resolveCommand(['org', 'update', 'a@acme.com', '--stage', 'trial'])).toEqual(['update_organization', { email: 'a@acme.com', stage: 'trial' }]);
        expect(await resolveCommand(['enrich', 'acme.com', '--force'])).toEqual(['enrich_organization', { domain: 'acme.com', force: true }]);
        expect(await resolveCommand(['attio', 'sync', 'acme.com'])).toEqual(['sync_to_attio', { domain: 'acme.com' }]);
        expect(await resolveCommand(['call', 'get_prospect', '{"email":"a@b.co"}'])).toEqual(['get_prospect', { email: 'a@b.co' }]);
    });

    it('reads note bodies from stdin', async () => {
        expect(await resolveCommand(['note', 'acme.com', '--kind', 'demo_note'], async () => 'Went well\n'))
            .toEqual(['log_note', { domain: 'acme.com', kind: 'demo_note', body: 'Went well' }]);
        await expect(resolveCommand(['note', 'acme.com'], async () => '')).rejects.toThrow(/--body/);
        await expect(resolveCommand(['bogus'])).rejects.toThrow(/unknown command/);
    });
});
