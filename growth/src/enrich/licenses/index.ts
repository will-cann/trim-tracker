import { SocrataLicenseSource, type SocrataSourceConfig } from './socrata';

/**
 * State cannabis license lookups.
 *
 * Each state publishes its registry differently; many use Socrata open-data
 * portals, which SocrataLicenseSource handles generically. Sources are
 * configured (not hard-coded) via LICENSE_SOURCES, a JSON array of
 * SocrataSourceConfig, because dataset IDs and column names change and must be
 * verified per state. See growth/README.md for the format.
 */

export interface LicenseRecord {
    state: string;
    licenseNumber: string;
    licenseType: string | null;
    status: string | null;
    legalName: string | null;
    dba: string | null;
    city: string | null;
    expiresOn: string | null;
    source: string;
    raw: unknown;
}

export interface LicenseQuery {
    names: string[];
    licenseNumbers: string[];
}

export interface LicenseSource {
    state: string;
    search(query: LicenseQuery): Promise<LicenseRecord[]>;
}

export function configuredLicenseSources(env = process.env.LICENSE_SOURCES): LicenseSource[] {
    if (!env) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(env);
    } catch {
        console.error('[licenses] LICENSE_SOURCES is not valid JSON; license lookup disabled');
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.map(c => new SocrataLicenseSource(c as SocrataSourceConfig));
}
