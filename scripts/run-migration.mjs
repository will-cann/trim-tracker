import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
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
    const files = process.argv.slice(2);

    if (files.length === 0) {
        console.error('Usage: node scripts/run-migration.mjs <migration-file> [...]');
        process.exit(1);
    }

    let totalFail = 0;
    for (const file of files) {
        totalFail += await run(file, file);
    }

    if (totalFail > 0) {
        console.error(`\n${totalFail} statement(s) failed.`);
        process.exit(1);
    }
    console.log('\nAll migrations applied successfully.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
