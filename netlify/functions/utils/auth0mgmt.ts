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
export async function sendInvitation(
    rawEmail: string,
    name?: string,
    /** Where to send them after they set the password (e.g. https://proper.neurocann.app). */
    resultUrl?: string,
): Promise<{ success: boolean; error?: string; inviteUrl?: string }> {
    if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
        return { success: false, error: 'Auth0 not configured' };
    }
    // Auth0 stores emails lowercased and users-by-email matches exactly, so
    // "NFedoronko@..." would miss the existing "nfedoronko@..." and then 409 on create.
    const email = rawEmail.trim().toLowerCase();

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
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

        const findUserId = async (): Promise<string | null> => {
            const res = await fetch(
                `https://${AUTH0_TENANT_DOMAIN}/api/v2/users-by-email?email=${encodeURIComponent(email)}`,
                { headers },
            );
            const users = await res.json();
            return Array.isArray(users) && users.length > 0 ? users[0].user_id : null;
        };

        // A password-change ticket is the invite link. With result_url the user lands
        // on that site after setting the password; Auth0 won't take it together with
        // client_id, and client_id alone only redirects if the application has a
        // Login URI configured, otherwise the flow ends on Auth0's confirmation page.
        const createTicket = async (userId: string): Promise<Response> =>
            fetch(`https://${AUTH0_TENANT_DOMAIN}/api/v2/tickets/password-change`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    user_id: userId,
                    ...(resultUrl ? { result_url: resultUrl } : { client_id: AUTH0_CLIENT_ID }),
                    mark_email_as_verified: true,
                    ttl_sec: 604800, // 7 days
                }),
            });

        let userId = await findUserId();
        let isNew = false;

        if (!userId) {
            // Create the user in Auth0 with a random password (they'll reset it via invite)
            const createRes = await fetch(`https://${AUTH0_TENANT_DOMAIN}/api/v2/users`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    email,
                    name: name || email.split('@')[0],
                    connection: 'Username-Password-Authentication',
                    password: crypto.randomUUID() + 'Aa1!', // random, they'll reset via ticket
                    email_verified: false,
                    // Our invite (the password ticket) verifies the email; Auth0's own
                    // "verify your email" message would arrive first and confuse people.
                    verify_email: false,
                }),
            });

            if (createRes.status === 409) {
                // Exists after all (e.g. created between lookup and create): invite that login.
                userId = await findUserId();
            } else if (!createRes.ok) {
                const err = await createRes.text();
                console.error('Failed to create Auth0 user:', err);
                return { success: false, error: 'Failed to create user account' };
            } else {
                userId = (await createRes.json()).user_id;
                isNew = true;
            }
            if (!userId) return { success: false, error: 'Failed to create user account' };
        }

        const ticketRes = await createTicket(userId);
        if (!ticketRes.ok) {
            const err = await ticketRes.text();
            console.error('Failed to create invite ticket:', err);
            // An existing login can still sign in normally without a fresh link.
            return isNew ? { success: false, error: 'Failed to send invitation' } : { success: true };
        }

        const ticket = await ticketRes.json();
        return { success: true, inviteUrl: rewriteTicketUrl(ticket.ticket) };
    } catch (error) {
        console.error('Error sending invitation:', error);
        const notConfigured = error instanceof Error && /not configured/.test(error.message);
        return {
            success: false,
            error: notConfigured
                ? "Invites aren't set up on this site (Auth0 Management API credentials missing)"
                : 'Failed to send invitation',
        };
    }
}
