import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'fs';
import { config } from 'dotenv';

// Parse --prod flag out of argv before we use the rest as file paths.
const rawArgs = process.argv.slice(2);
const isProd = rawArgs.includes('--prod');
const fileArgs = rawArgs.filter(a => a !== '--prod');

if (isProd) {
    // Prod mode: refuse to run unless .env.production.local exists with a DATABASE_URL.
    // This keeps prod credentials out of the default .env and forces a deliberate opt-in.
    const prodEnvPath = '.env.production.local';
    if (!existsSync(prodEnvPath)) {
        console.error(`--prod requires ${prodEnvPath} with DATABASE_URL (or NETLIFY_DATABASE_URL_UNPOOLED) set.`);
        console.error(`Create the file, paste the prod connection string, run the migration, then clear the file.`);
        process.exit(1);
    }
    config({ path: prodEnvPath });
} else {
    config();
}

// Prefer the unpooled endpoint for migrations — some DDL patterns (advisory locks, session-level
// state) misbehave under PgBouncer transaction-mode pooling. Fall back to whatever .env provides.
const DATABASE_URL = process.env.NETLIFY_DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('No database connection string set (NETLIFY_DATABASE_URL_UNPOOLED or DATABASE_URL)');
    process.exit(1);
}

// Print the resolved host so you always know which DB you just hit. Never print the password.
const resolvedHost = (() => {
    try { return new URL(DATABASE_URL).host; } catch { return '(unparseable)'; }
})();
console.log(`Target: ${resolvedHost} ${isProd ? '[PROD]' : '[dev]'}`);

if (isProd) {
    // 5-second countdown so a fat-fingered --prod is recoverable with Ctrl+C.
    console.log('Running against PRODUCTION in 5 seconds. Ctrl+C to abort.');
    await new Promise(resolve => {
        let n = 5;
        const t = setInterval(() => {
            process.stdout.write(`  ${n}... `);
            if (--n < 0) { clearInterval(t); process.stdout.write('\n'); resolve(); }
        }, 1000);
    });
}

const sql = neon(DATABASE_URL);

function splitSQL(content) {
    const statements = [];
    let current = '';
    let inDollarQuote = false;

    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();

        // Skip comment-only lines outside of dollar-quoted blocks
        if (!inDollarQuote && (trimmed.startsWith('--') || trimmed === '')) {
            continue;
        }

        // Track $$ dollar quoting
        const dollarMatches = line.match(/\$\$/g);
        if (dollarMatches) {
            for (const _ of dollarMatches) {
                inDollarQuote = !inDollarQuote;
            }
        }

        current += line + '\n';

        // Statement ends at ; when not inside dollar quotes
        if (!inDollarQuote && trimmed.endsWith(';')) {
            const stmt = current.trim();
            if (stmt && stmt.length > 1) {
                statements.push(stmt);
            }
            current = '';
        }
    }

    if (current.trim()) {
        statements.push(current.trim());
    }

    return statements;
}

async function run(filePath, label) {
    const content = readFileSync(filePath, 'utf8');
    const statements = splitSQL(content);

    console.log(`\n${label}: ${statements.length} statements`);

    let ok = 0, fail = 0;
    for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
        try {
            await sql.query(stmt);
            ok++;
            console.log(`  [${i + 1}/${statements.length}] OK: ${preview}...`);
        } catch (e) {
            fail++;
            console.error(`  [${i + 1}/${statements.length}] FAIL: ${preview}...`);
            console.error(`    Error: ${e.message}`);
        }
    }
    console.log(`  Done: ${ok} succeeded, ${fail} failed`);
    return fail;
}

async function main() {
    if (fileArgs.length === 0) {
        console.error('Usage: node scripts/run-migration.mjs [--prod] <migration-file> [...]');
        process.exit(1);
    }

    let totalFail = 0;
    for (const file of fileArgs) {
        totalFail += await run(file, file);
    }

    if (totalFail > 0) {
        console.error(`\n${totalFail} statement(s) failed.`);
        process.exit(1);
    }
    console.log('\nAll migrations applied successfully.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
