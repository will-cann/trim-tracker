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

export interface AuthenticatedContext {
    userId: string;
    companyId: string;
    role: string;
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
        };
    }

    const auth0User = await verifyToken(authHeader);
    if (!auth0User) return null;

    try {
        // Look up existing user by Auth0 sub
        const { rows } = await sql`
            SELECT id, company_id, role
            FROM users
            WHERE external_id = ${auth0User.sub}
        `;

        if (rows.length > 0) {
            return {
                userId: rows[0].id,
                companyId: rows[0].company_id,
                role: rows[0].role
            };
        }

        // Auto-provision: create company + user on first login
        console.log(`Auto-provisioning user for external_id ${auth0User.sub}`);
        const email = auth0User.email || `${auth0User.sub}@unknown.com`;
        const name = auth0User.name || auth0User.nickname || email.split('@')[0];

        // Check if a user with this email already exists (link to existing account)
        const { rows: existingByEmail } = await sql`
            SELECT id, company_id, role FROM users WHERE email = ${email}
        `;

        if (existingByEmail.length > 0) {
            // Link Auth0 sub to existing user
            await sql`
                UPDATE users SET external_id = ${auth0User.sub} WHERE id = ${existingByEmail[0].id}
            `;
            return {
                userId: existingByEmail[0].id,
                companyId: existingByEmail[0].company_id,
                role: existingByEmail[0].role
            };
        }

        // Create new company and user
        const { rows: [newCompany] } = await sql`
            INSERT INTO companies (id, name) VALUES (gen_random_uuid(), ${name || 'My Company'})
            RETURNING id
        `;

        const { rows: [newUser] } = await sql`
            INSERT INTO users (id, company_id, external_id, email, name, role)
            VALUES (gen_random_uuid(), ${newCompany.id}, ${auth0User.sub}, ${email}, ${name}, 'admin')
            RETURNING id, company_id, role
        `;

        return {
            userId: newUser.id,
            companyId: newUser.company_id,
            role: newUser.role
        };
    } catch (error) {
        console.error('Error resolving user context:', error);
        return null;
    }
}
