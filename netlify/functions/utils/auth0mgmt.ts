const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_TENANT_DOMAIN = process.env.AUTH0_TENANT_DOMAIN || AUTH0_DOMAIN;
const AUTH0_MGMT_CLIENT_ID = process.env.AUTH0_MGMT_CLIENT_ID;
const AUTH0_MGMT_CLIENT_SECRET = process.env.AUTH0_MGMT_CLIENT_SECRET;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID || process.env.VITE_AUTH0_CLIENT_ID;

// Cache the M2M token in-memory (shared across warm invocations)
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get a Management API access token using client credentials grant.
 */
async function getMgmtToken(): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expiresAt) {
        return cachedToken.token;
    }

    if (!AUTH0_TENANT_DOMAIN || !AUTH0_MGMT_CLIENT_ID || !AUTH0_MGMT_CLIENT_SECRET) {
        throw new Error('Auth0 Management API credentials not configured');
    }

    const response = await fetch(`https://${AUTH0_TENANT_DOMAIN}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: AUTH0_MGMT_CLIENT_ID,
            client_secret: AUTH0_MGMT_CLIENT_SECRET,
            audience: `https://${AUTH0_TENANT_DOMAIN}/api/v2/`,
            grant_type: 'client_credentials',
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to get Auth0 M2M token: ${err}`);
    }

    const data = await response.json();
    cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in - 60) * 1000, // refresh 60s early
    };

    return cachedToken.token;
}

/**
 * Send an invitation to join the app via Auth0.
 * Creates a password change ticket that acts as an invite link.
 */
export async function sendInvitation(email: string, name?: string): Promise<{ success: boolean; error?: string; inviteUrl?: string }> {
    if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
        return { success: false, error: 'Auth0 not configured' };
    }

    // Rewrite the ticket URL's hostname from the tenant domain to the custom
    // domain so invite links show login.neurocann.app instead of dev-*.auth0.com.
    const rewriteTicketUrl = (url: string): string => {
        if (!AUTH0_TENANT_DOMAIN || AUTH0_TENANT_DOMAIN === AUTH0_DOMAIN) return url;
        try {
            const parsed = new URL(url);
            parsed.host = AUTH0_DOMAIN!;
            return parsed.toString();
        } catch {
            return url;
        }
    };

    try {
        const token = await getMgmtToken();

        // First, check if user already exists in Auth0
        const searchRes = await fetch(
            `https://${AUTH0_TENANT_DOMAIN}/api/v2/users-by-email?email=${encodeURIComponent(email)}`,
            { headers: { Authorization: `Bearer ${token}` } },
        );

        const existingUsers = await searchRes.json();

        if (Array.isArray(existingUsers) && existingUsers.length > 0) {
            // User already exists — generate a fresh invite link (doesn't void previous ones)
            const existingUser = existingUsers[0];
            const ticketRes = await fetch(`https://${AUTH0_TENANT_DOMAIN}/api/v2/tickets/password-change`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: existingUser.user_id,
                    client_id: AUTH0_CLIENT_ID,
                    mark_email_as_verified: true,
                    ttl_sec: 604800, // 7 days
                }),
            });

            if (!ticketRes.ok) {
                // Ticket failed but user exists — they can still log in normally
                return { success: true };
            }

            const ticket = await ticketRes.json();
            return { success: true, inviteUrl: rewriteTicketUrl(ticket.ticket) };
        }

        // Create the user in Auth0 with a random password (they'll reset it via invite)
        const createRes = await fetch(`https://${AUTH0_TENANT_DOMAIN}/api/v2/users`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email,
                name: name || email.split('@')[0],
                connection: 'Username-Password-Authentication',
                password: crypto.randomUUID() + 'Aa1!', // random, they'll reset via ticket
                email_verified: false,
            }),
        });

        if (!createRes.ok) {
            const err = await createRes.text();
            console.error('Failed to create Auth0 user:', err);
            return { success: false, error: 'Failed to create user account' };
        }

        const newUser = await createRes.json();

        // Send a password change ticket (acts as the invite link)
        const ticketRes = await fetch(`https://${AUTH0_TENANT_DOMAIN}/api/v2/tickets/password-change`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: newUser.user_id,
                client_id: AUTH0_CLIENT_ID,
                mark_email_as_verified: true,
                ttl_sec: 604800, // 7 days
            }),
        });

        if (!ticketRes.ok) {
            const err = await ticketRes.text();
            console.error('Failed to create invite ticket:', err);
            return { success: false, error: 'Failed to send invitation' };
        }

        const ticket = await ticketRes.json();
        return { success: true, inviteUrl: ticket.ticket };
    } catch (error) {
        console.error('Error sending invitation:', error);
        return { success: false, error: 'Failed to send invitation' };
    }
}
