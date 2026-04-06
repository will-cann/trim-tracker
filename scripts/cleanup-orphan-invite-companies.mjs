#!/usr/bin/env node
/**
 * Cleanup script for orphan companies created by the invite auth bug.
 *
 * Background: before the auth.ts email-claim fix, users accepting an invite
 * would hit resolveContext() without an `email` claim on their access token.
 * The fallback created a brand new company with them as admin instead of
 * linking them to the inviting company's trimmer_profile.
 *
 * This script:
 *   1. Finds orphan companies (single admin user, user email is synthetic
 *      `{sub}@unknown.com` OR matches an un-linked trimmer_profile in another
 *      company).
 *   2. For each, if a matching unlinked trimmer_profile exists elsewhere,
 *      re-points the user to that company + role and links the profile.
 *   3. Deletes the now-empty orphan company.
 *
 * Usage:
 *   node scripts/cleanup-orphan-invite-companies.mjs            # dry run
 *   node scripts/cleanup-orphan-invite-companies.mjs --apply    # execute
 */

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
}
const sql = neon(DATABASE_URL);

const APPLY = process.argv.includes('--apply');

async function main() {
    console.log(APPLY ? 'MODE: APPLY (changes will be written)' : 'MODE: DRY RUN (no changes)');

    // Find candidate orphan companies: companies whose ONLY user has either a
    // synthetic unknown email or an email that matches an unlinked
    // trimmer_profile in a DIFFERENT company.
    const candidates = await sql`
        SELECT
            c.id            AS company_id,
            c.name          AS company_name,
            c.created_at    AS company_created_at,
            u.id            AS user_id,
            u.email         AS user_email,
            u.external_id   AS user_external_id,
            u.role          AS user_role
        FROM companies c
        JOIN users u ON u.company_id = c.id
        WHERE (
            SELECT COUNT(*) FROM users u2 WHERE u2.company_id = c.id
        ) = 1
        AND (
            u.email LIKE '%@unknown.com'
            OR EXISTS (
                SELECT 1 FROM trimmer_profiles tp
                WHERE LOWER(tp.email) = LOWER(u.email)
                  AND tp.user_id IS NULL
                  AND tp.company_id <> c.id
            )
        )
        ORDER BY c.created_at DESC
    `;

    if (candidates.length === 0) {
        console.log('\nNo orphan companies found. Database is clean.');
        return;
    }

    console.log(`\nFound ${candidates.length} orphan company candidate(s):\n`);

    let relinked = 0;
    let deleted = 0;
    let skipped = 0;

    for (const c of candidates) {
        console.log(`- Company ${c.company_id} "${c.company_name}" (created ${c.company_created_at?.toISOString?.() ?? c.company_created_at})`);
        console.log(`    user ${c.user_id} <${c.user_email}> sub=${c.user_external_id}`);

        // Does this user's email match an unlinked trimmer_profile elsewhere?
        // (If email is the synthetic @unknown.com form, nothing will match and
        // we'll just delete the orphan.)
        const targets = await sql`
            SELECT id, company_id, role, departments, name
            FROM trimmer_profiles
            WHERE LOWER(email) = LOWER(${c.user_email})
              AND user_id IS NULL
              AND company_id <> ${c.company_id}
            ORDER BY created_at ASC
            LIMIT 1
        `;

        // Safety: confirm the user owns no real data in the orphan company.
        // If they do, skip — a human should review it.
        const [activity] = await sql`
            SELECT
                (SELECT COUNT(*) FROM trim_sessions WHERE company_id = ${c.company_id})  AS trim_sessions,
                (SELECT COUNT(*) FROM harvests      WHERE company_id = ${c.company_id})  AS harvests,
                (SELECT COUNT(*) FROM plants        WHERE company_id = ${c.company_id})  AS plants,
                (SELECT COUNT(*) FROM packages      WHERE company_id = ${c.company_id})  AS packages
        `;
        const hasActivity =
            Number(activity.trim_sessions) > 0 ||
            Number(activity.harvests) > 0 ||
            Number(activity.plants) > 0 ||
            Number(activity.packages) > 0;

        if (hasActivity) {
            console.log(`    SKIP: orphan company has real data (trim_sessions=${activity.trim_sessions}, harvests=${activity.harvests}, plants=${activity.plants}, packages=${activity.packages}). Review manually.`);
            skipped++;
            continue;
        }

        if (targets.length > 0) {
            const t = targets[0];
            console.log(`    RELINK -> company ${t.company_id} as ${t.role} (profile ${t.id})`);

            if (APPLY) {
                await sql`
                    UPDATE users SET
                        company_id  = ${t.company_id},
                        role        = ${t.role},
                        departments = ${t.departments || []},
                        updated_at  = NOW()
                    WHERE id = ${c.user_id}
                `;
                await sql`
                    UPDATE trimmer_profiles SET
                        user_id       = ${c.user_id},
                        invite_status = 'accepted'
                    WHERE id = ${t.id}
                `;
                // Also remove any auto-created trimmer_profile in the orphan company
                await sql`
                    DELETE FROM trimmer_profiles
                    WHERE company_id = ${c.company_id} AND user_id = ${c.user_id}
                `;
                await sql`DELETE FROM companies WHERE id = ${c.company_id}`;
            }
            relinked++;
        } else {
            console.log(`    DELETE: no matching invite found; removing orphan company + user`);
            if (APPLY) {
                // users + trimmer_profiles cascade on company delete
                await sql`DELETE FROM companies WHERE id = ${c.company_id}`;
            }
            deleted++;
        }
    }

    console.log(`\nSummary: relinked=${relinked}, deleted=${deleted}, skipped=${skipped}`);
    if (!APPLY) {
        console.log('\nDry run only. Re-run with --apply to execute.');
    }
}

main().catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
});
