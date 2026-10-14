#!/usr/bin/env -S npx tsx
/**
 * growth: CLI for the NeuroCann growth server. A thin client over the same
 * MCP tools Claude uses, so there is one code path.
 *
 *   GROWTH_URL      default http://localhost:8787
 *   GROWTH_API_KEY  one of the server's GROWTH_API_KEYS
 */
import 'dotenv/config';

const USAGE = `usage: growth <command>

  summary                                     pipeline counts
  demos list [--status S] [--since DAYS] [--limit N]
  demos update <id> [--status S] [--scheduled-at ISO]
  prospects search [QUERY] [--stage S] [--limit N]
  prospect get <email|domain|org-id>
  org update <email|domain|org-id> [--stage S] [--name NAME]
  note <email|domain|org-id> --kind call_note|demo_note [--subject S] [--body TEXT | stdin]
  enrich <email|domain|org-id> [--force]
  attio sync <email|domain|org-id>
  tools                                       list MCP tools
  call <tool> [JSON-ARGS]                     call any tool directly

statuses: requested scheduled completed no_show canceled
stages:   lead qualified demo trial customer churned disqualified`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function selector(value: string | undefined): Record<string, string> {
    if (!value) throw new UsageError('missing <email|domain|org-id>');
    if (value.includes('@')) return { email: value };
    if (UUID_RE.test(value)) return { organization_id: value };
    return { domain: value };
}

class UsageError extends Error {}

export function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, string | true> } {
    const positional: string[] = [];
    const flags: Record<string, string | true> = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('--')) {
                flags[key] = next;
                i++;
            } else {
                flags[key] = true;
            }
        } else {
            positional.push(a);
        }
    }
    return { positional, flags };
}

function flag(flags: Record<string, string | true>, name: string): string | undefined {
    const v = flags[name];
    return typeof v === 'string' ? v : undefined;
}

function num(v: string | undefined): number | undefined {
    return v === undefined ? undefined : Number(v);
}

function compact(obj: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

async function readStdin(): Promise<string> {
    if (process.stdin.isTTY) return '';
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString('utf8');
}

/** Map a command line to [tool, args], or a special 'tools/list'. */
export async function resolveCommand(argv: string[], stdin: () => Promise<string> = readStdin): Promise<[string, Record<string, unknown>]> {
    const { positional: [cmd, sub, ...rest], flags } = parseArgs(argv);
    switch (cmd) {
        case 'summary':
            return ['pipeline_summary', {}];
        case 'demos':
            if (sub === 'list') return ['list_demo_requests', compact({ status: flag(flags, 'status'), since_days: num(flag(flags, 'since')), limit: num(flag(flags, 'limit')) })];
            if (sub === 'update') {
                if (!rest[0]) throw new UsageError('demos update <id>');
                return ['update_demo_request', compact({ id: rest[0], status: flag(flags, 'status'), scheduled_at: flag(flags, 'scheduled-at') })];
            }
            break;
        case 'prospects':
            if (sub === 'search') return ['search_prospects', compact({ query: rest[0], stage: flag(flags, 'stage'), limit: num(flag(flags, 'limit')) })];
            break;
        case 'prospect':
            if (sub === 'get') return ['get_prospect', selector(rest[0])];
            break;
        case 'org':
            if (sub === 'update') return ['update_organization', compact({ ...selector(rest[0]), stage: flag(flags, 'stage'), name: flag(flags, 'name') })];
            break;
        case 'note': {
            const body = flag(flags, 'body') ?? (await stdin()).trim();
            if (!body) throw new UsageError('note needs --body or text on stdin');
            return ['log_note', compact({ ...selector(sub), kind: flag(flags, 'kind') ?? 'call_note', subject: flag(flags, 'subject'), body })];
        }
        case 'enrich':
            return ['enrich_organization', { ...selector(sub), force: flags.force === true }];
        case 'attio':
            if (sub === 'sync') return ['sync_to_attio', selector(rest[0])];
            break;
        case 'tools':
            return ['tools/list', {}];
        case 'call':
            if (!sub) throw new UsageError('call <tool> [JSON-ARGS]');
            return [sub, rest[0] ? JSON.parse(rest[0]) : {}];
    }
    throw new UsageError(cmd ? `unknown command: ${[cmd, sub].filter(Boolean).join(' ')}` : 'missing command');
}

async function rpc(method: string, params: unknown) {
    const url = `${(process.env.GROWTH_URL || 'http://localhost:8787').replace(/\/$/, '')}/mcp`;
    const key = process.env.GROWTH_API_KEY;
    if (!key) throw new Error('GROWTH_API_KEY is not set');
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await res.json().catch(() => null) as any;
    if (!res.ok || json?.error) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
    return json.result;
}

async function main() {
    const argv = process.argv.slice(2);
    if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
        console.log(USAGE);
        return;
    }
    const [tool, args] = await resolveCommand(argv);
    if (tool === 'tools/list') {
        const { tools } = await rpc('tools/list', {});
        for (const t of tools) console.log(`${t.name.padEnd(22)} ${t.description}`);
        return;
    }
    const result = await rpc('tools/call', { name: tool, arguments: args });
    const text = result.content?.map((c: any) => c.text).join('\n') ?? '';
    if (result.isError) {
        console.error(text);
        process.exit(1);
    }
    console.log(JSON.stringify(result.structuredContent ?? text, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('/growth')) {
    main().catch(err => {
        console.error(err instanceof UsageError ? `${err.message}\n\n${USAGE}` : `error: ${err.message}`);
        process.exit(err instanceof UsageError ? 2 : 1);
    });
}
