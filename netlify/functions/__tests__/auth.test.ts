import { describe, it, expect } from 'vitest';
import { authorize } from '../utils/auth';
import type { AuthenticatedContext } from '../utils/auth';

function makeContext(role: string): AuthenticatedContext {
    return {
        userId: 'test-user',
        companyId: 'test-company',
        role: role as any,
    };
}

describe('authorize', () => {
    describe('role hierarchy', () => {
        it('admin can access everything', () => {
            const ctx = makeContext('admin');
            expect(authorize(ctx, 'admin')).toBeNull();
            expect(authorize(ctx, 'manager')).toBeNull();
            expect(authorize(ctx, 'lead')).toBeNull();
            expect(authorize(ctx, 'worker')).toBeNull();
        });

        it('manager can access manager, lead, and worker', () => {
            const ctx = makeContext('manager');
            expect(authorize(ctx, 'admin')).not.toBeNull();
            expect(authorize(ctx, 'manager')).toBeNull();
            expect(authorize(ctx, 'lead')).toBeNull();
            expect(authorize(ctx, 'worker')).toBeNull();
        });

        it('lead can access lead and worker', () => {
            const ctx = makeContext('lead');
            expect(authorize(ctx, 'admin')).not.toBeNull();
            expect(authorize(ctx, 'manager')).not.toBeNull();
            expect(authorize(ctx, 'lead')).toBeNull();
            expect(authorize(ctx, 'worker')).toBeNull();
        });

        it('worker can only access worker-level', () => {
            const ctx = makeContext('worker');
            expect(authorize(ctx, 'admin')).not.toBeNull();
            expect(authorize(ctx, 'manager')).not.toBeNull();
            expect(authorize(ctx, 'lead')).not.toBeNull();
            expect(authorize(ctx, 'worker')).toBeNull();
        });
    });

    describe('response format', () => {
        it('returns null when authorized', () => {
            expect(authorize(makeContext('admin'), 'worker')).toBeNull();
        });

        it('returns 403 with error message when denied', () => {
            const result = authorize(makeContext('worker'), 'admin');
            expect(result).toEqual({
                statusCode: 403,
                body: JSON.stringify({ error: 'Forbidden: insufficient permissions' }),
            });
        });
    });

    describe('unknown role', () => {
        it('denies access for unknown roles', () => {
            const ctx = makeContext('unknown');
            expect(authorize(ctx, 'worker')).not.toBeNull();
        });
    });
});
