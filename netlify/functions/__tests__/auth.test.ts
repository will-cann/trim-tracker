import { describe, it, expect } from 'vitest';
import { authorize } from '../utils/auth';
import type { AuthenticatedContext } from '../utils/auth';

function makeContext(role: string, departments: string[] = []): AuthenticatedContext {
    return {
        userId: 'test-user',
        companyId: 'test-company',
        role: role as any,
        departments: departments as any,
    };
}

describe('authorize', () => {
    describe('role hierarchy', () => {
        it('admin can access everything', () => {
            const ctx = makeContext('admin');
            expect(authorize(ctx, 'admin')).toBeNull();
            expect(authorize(ctx, 'director')).toBeNull();
            expect(authorize(ctx, 'department_manager')).toBeNull();
            expect(authorize(ctx, 'technician')).toBeNull();
        });

        it('director can access director, department_manager, and technician', () => {
            const ctx = makeContext('director');
            expect(authorize(ctx, 'admin')).not.toBeNull();
            expect(authorize(ctx, 'director')).toBeNull();
            expect(authorize(ctx, 'department_manager')).toBeNull();
            expect(authorize(ctx, 'technician')).toBeNull();
        });

        it('department_manager can access department_manager and technician', () => {
            const ctx = makeContext('department_manager');
            expect(authorize(ctx, 'admin')).not.toBeNull();
            expect(authorize(ctx, 'director')).not.toBeNull();
            expect(authorize(ctx, 'department_manager')).toBeNull();
            expect(authorize(ctx, 'technician')).toBeNull();
        });

        it('technician can only access technician-level', () => {
            const ctx = makeContext('technician');
            expect(authorize(ctx, 'admin')).not.toBeNull();
            expect(authorize(ctx, 'director')).not.toBeNull();
            expect(authorize(ctx, 'department_manager')).not.toBeNull();
            expect(authorize(ctx, 'technician')).toBeNull();
        });
    });

    describe('department checks', () => {
        it('admin bypasses department check', () => {
            const ctx = makeContext('admin', []);
            expect(authorize(ctx, 'technician', 'cultivation')).toBeNull();
        });

        it('director bypasses department check', () => {
            const ctx = makeContext('director', []);
            expect(authorize(ctx, 'technician', 'cultivation')).toBeNull();
        });

        it('department_manager with matching department passes', () => {
            const ctx = makeContext('department_manager', ['cultivation', 'trim']);
            expect(authorize(ctx, 'technician', 'cultivation')).toBeNull();
        });

        it('department_manager without matching department is denied', () => {
            const ctx = makeContext('department_manager', ['extraction']);
            const result = authorize(ctx, 'technician', 'cultivation');
            expect(result).not.toBeNull();
            expect(result?.statusCode).toBe(403);
        });

        it('technician without matching department is denied', () => {
            const ctx = makeContext('technician', ['trim']);
            const result = authorize(ctx, 'technician', 'cultivation');
            expect(result).not.toBeNull();
        });

        it('technician with matching department passes', () => {
            const ctx = makeContext('technician', ['cultivation']);
            expect(authorize(ctx, 'technician', 'cultivation')).toBeNull();
        });
    });

    describe('response format', () => {
        it('returns null when authorized', () => {
            expect(authorize(makeContext('admin'), 'technician')).toBeNull();
        });

        it('returns 403 with error message when denied', () => {
            const result = authorize(makeContext('technician'), 'admin');
            expect(result).toEqual({
                statusCode: 403,
                body: JSON.stringify({ error: 'Forbidden: insufficient permissions' }),
            });
        });
    });

    describe('unknown role', () => {
        it('denies access for unknown roles', () => {
            const ctx = makeContext('unknown');
            expect(authorize(ctx, 'technician')).not.toBeNull();
        });
    });
});
