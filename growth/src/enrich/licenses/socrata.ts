import type { LicenseQuery, LicenseRecord, LicenseSource } from './index';

/**
 * Generic adapter for a state license registry published on a Socrata portal
 * (SODA API: GET https://{domain}/resource/{dataset}.json?$where=...).
 */
export interface SocrataSourceConfig {
    state: string;            // e.g. "WA"
    domain: string;           // e.g. "data.example.gov"
    dataset: string;          // Socrata 4x4 id, e.g. "abcd-1234"
    fields: {
        licenseNumber: string;
        legalName?: string;
        dba?: string;
        licenseType?: string;
        status?: string;
        city?: string;
        expiresOn?: string;
    };
    /** Optional Socrata app token (raises rate limits). */
    appToken?: string;
}

const MAX_RESULTS = 10;

function soqlString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** Strip legal suffixes so "Acme Farms, LLC" matches "ACME FARMS". */
export function normalizeCompanyName(name: string): string {
    return name
        .toUpperCase()
        .replace(/[.,]/g, ' ')
        .replace(/\b(LLC|L L C|INC|CORP|CORPORATION|CO|LTD|LP|LLP|PLLC|COMPANY)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function buildWhereClause(cfg: SocrataSourceConfig, q: LicenseQuery): string | null {
    const clauses: string[] = [];
    for (const n of q.licenseNumbers) {
        clauses.push(`upper(${cfg.fields.licenseNumber}) = ${soqlString(n.toUpperCase())}`);
    }
    for (const raw of q.names) {
        const name = normalizeCompanyName(raw);
        if (name.length < 3) continue;
        const like = soqlString(`%${name}%`);
        if (cfg.fields.legalName) clauses.push(`upper(${cfg.fields.legalName}) like ${like}`);
        if (cfg.fields.dba) clauses.push(`upper(${cfg.fields.dba}) like ${like}`);
    }
    return clauses.length ? clauses.join(' OR ') : null;
}

export class SocrataLicenseSource implements LicenseSource {
    readonly state: string;

    constructor(private cfg: SocrataSourceConfig, private fetchFn: typeof fetch = fetch) {
        this.state = cfg.state.toUpperCase();
    }

    async search(q: LicenseQuery): Promise<LicenseRecord[]> {
        const where = buildWhereClause(this.cfg, q);
        if (!where) return [];
        const url = new URL(`https://${this.cfg.domain}/resource/${this.cfg.dataset}.json`);
        url.searchParams.set('$where', where);
        url.searchParams.set('$limit', String(MAX_RESULTS));
        const res = await this.fetchFn(url, {
            headers: this.cfg.appToken ? { 'X-App-Token': this.cfg.appToken } : {},
        });
        if (!res.ok) throw new Error(`${this.state} license lookup → ${res.status}`);
        const rows = (await res.json()) as Array<Record<string, unknown>>;
        const f = this.cfg.fields;
        const get = (row: Record<string, unknown>, key?: string) => {
            const v = key ? row[key] : undefined;
            return v === undefined || v === null || v === '' ? null : String(v);
        };
        return rows
            .map(row => ({
                state: this.state,
                licenseNumber: get(row, f.licenseNumber) ?? '',
                licenseType: get(row, f.licenseType),
                status: get(row, f.status),
                legalName: get(row, f.legalName),
                dba: get(row, f.dba),
                city: get(row, f.city),
                expiresOn: get(row, f.expiresOn)?.slice(0, 10) ?? null,
                source: `socrata:${this.cfg.domain}/${this.cfg.dataset}`,
                raw: row,
            }))
            .filter(r => r.licenseNumber);
    }
}
