import { createRemoteJWKSet, jwtVerify } from 'jose';
import { sql } from './db';

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

// Lazy-init JWKS to avoid crashing at module load when AUTH0_DOMAIN is not set
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
    if (!_jwks) {
        if (!AUTH0_DOMAIN) throw new Error('AUTH0_DOMAIN not set');
        _jwks = createRemoteJWKSet(new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`));
    }
    return _jwks;
}

export interface Auth0User {
    sub: string;
    email?: string;
    [key: string]: any;
}

export type Role = 'admin' | 'director' | 'department_manager' | 'technician';
export type Department = 'cultivation' | 'extraction' | 'post_harvest' | 'trim' | 'procurement' | 'lab' | 'compliance';

export interface AuthenticatedContext {
    userId: string;
    companyId: string;
    role: Role;
    departments: Department[];
}

const ROLE_LEVEL: Record<Role, number> = {
    admin: 50,
    director: 40,
    department_manager: 30,
    technician: 10,
};

/**
 * Check if a user's role meets the minimum required level,
 * and optionally that they belong to a required department.
 * Admin and director bypass department checks.
 * Returns null if authorized, or an HTTP response object if not.
 */
export function authorize(context: AuthenticatedContext, minRole: Role, requiredDept?: Department) {
    const userLevel = ROLE_LEVEL[context.role] ?? 0;
    const requiredLevel = ROLE_LEVEL[minRole];
    if (userLevel < requiredLevel) {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: 'Forbidden: insufficient permissions' }),
        };
    }
    // Admin and director bypass department checks
    if (requiredDept && context.role !== 'admin' && context.role !== 'director') {
        if (!context.departments.includes(requiredDept)) {
            return {
                statusCode: 403,
                body: JSON.stringify({ error: 'Forbidden: insufficient department permissions' }),
            };
        }
    }
    return null;
}

export async function verifyToken(authHeader?: string): Promise<Auth0User | null> {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.split(' ')[1];

    try {
        const { payload } = await jwtVerify(token, getJWKS(), {
            issuer: `https://${AUTH0_DOMAIN}/`,
            audience: AUTH0_AUDIENCE,
        });

        return payload as unknown as Auth0User;
    } catch (error) {
        console.error('JWT Verification failed:', error);
        return null;
    }
}

export async function resolveContext(authHeader?: string): Promise<AuthenticatedContext | null> {
    // Dev bypass — skip JWT verification and return seed user context
    if (process.env.DEV_BYPASS_AUTH === 'true') {
        return {
            userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            companyId: '11111111-1111-1111-1111-111111111111',
            role: 'admin',
            departments: [],
        };
    }

    const auth0User = await verifyToken(authHeader);
    if (!auth0User) return null;

    try {
        // Look up existing user by Auth0 sub
        const { rows } = await sql`
            SELECT id, company_id, role, departments
            FROM users
            WHERE external_id = ${auth0User.sub}
        `;

        if (rows.length > 0) {
            return {
                userId: rows[0].id,
                companyId: rows[0].company_id,
                role: rows[0].role,
                departments: rows[0].departments || [],
            };
        }

        // Auto-provision on first login.
        // Auth0 access tokens don't include `email` by default — a Post-Login
        // Action injects it as a namespaced custom claim.
        const claimedEmail = (auth0User.email
            || auth0User['https://trimtracker.com/email']
            || auth0User['https://neurocann.app/email']) as string | undefined;

        if (!claimedEmail) {
            console.error(`Refusing to auto-provision user for ${auth0User.sub}: no email claim on access token. Check the Auth0 Post-Login Action that sets the email custom claim.`);
            return null;
        }

        console.log(`Auto-provisioning user for external_id ${auth0User.sub}`);
        const email = claimedEmail;
        const name = (auth0User.name || auth0User.nickname || email.split('@')[0]) as string;

        // Check if a user with this email already exists (link Auth0 sub to existing account)
        const { rows: existingByEmail } = await sql`
            SELECT id, company_id, role, departments FROM users WHERE email = ${email}
        `;

        if (existingByEmail.length > 0) {
            await sql`
                UPDATE users SET external_id = ${auth0User.sub} WHERE id = ${existingByEmail[0].id}
            `;
            return {
                userId: existingByEmail[0].id,
                companyId: existingByEmail[0].company_id,
                role: existingByEmail[0].role,
                departments: existingByEmail[0].departments || [],
            };
        }

        // Check if this email was pre-registered as a team member (invited via trimmer_profiles)
        const { rows: invitedProfiles } = await sql`
            SELECT tp.id AS profile_id, tp.company_id, tp.role, tp.name AS profile_name, tp.departments
            FROM trimmer_profiles tp
            WHERE LOWER(tp.email) = LOWER(${email})
              AND tp.user_id IS NULL
            LIMIT 1
        `;

        if (invitedProfiles.length > 0) {
            const profile = invitedProfiles[0];
            const profileDepts = profile.departments || [];
            // Create user in the invited company with the assigned role and departments
            const { rows: [newUser] } = await sql`
                INSERT INTO users (id, company_id, external_id, email, name, role, departments)
                VALUES (gen_random_uuid(), ${profile.company_id}, ${auth0User.sub}, ${email}, ${name || profile.profile_name}, ${profile.role}, ${profileDepts})
                RETURNING id, company_id, role, departments
            `;
            // Link the profile to the new user
            await sql`
                UPDATE trimmer_profiles SET user_id = ${newUser.id} WHERE id = ${profile.profile_id}
            `;
            console.log(`Linked invited user ${email} to company ${profile.company_id} as ${profile.role}`);
            return {
                userId: newUser.id,
                companyId: newUser.company_id,
                role: newUser.role,
                departments: newUser.departments || [],
            };
        }

        // No invite found — create new company and user as admin
        const { rows: [newCompany] } = await sql`
            INSERT INTO companies (id, name) VALUES (gen_random_uuid(), ${name || 'My Company'})
            RETURNING id
        `;

        const { rows: [newUser] } = await sql`
            INSERT INTO users (id, company_id, external_id, email, name, role)
            VALUES (gen_random_uuid(), ${newCompany.id}, ${auth0User.sub}, ${email}, ${name}, 'admin')
            RETURNING id, company_id, role
        `;

        // Auto-create a trimmer_profile so the admin appears in the team roster
        await sql`
            INSERT INTO trimmer_profiles (id, company_id, name, status, role, email, user_id, invite_status)
            VALUES (gen_random_uuid(), ${newCompany.id}, ${name}, 'active', 'admin', ${email}, ${newUser.id}, 'accepted')
        `;

        return {
            userId: newUser.id,
            companyId: newUser.company_id,
            role: newUser.role,
            departments: [],
        };
    } catch (error) {
        console.error('Error resolving user context:', error);
        return null;
    }
}
