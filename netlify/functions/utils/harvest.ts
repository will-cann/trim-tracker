/**
 * Harvest utility functions — batch ID generation, strain abbreviation, etc.
 */

/**
 * Generate a default strain abbreviation.
 * - If < 5 chars, strip spaces and return as-is (e.g., "OG" → "OG", "GDP" → "GDP")
 * - Otherwise, take first letter of each word, uppercased (e.g., "Blue Dream" → "BD")
 */
export function getStrainAbbrev(strainName: string): string {
    const trimmed = strainName.trim();
    if (trimmed.length < 5) {
        return trimmed.replace(/ /g, '');
    }
    return trimmed
        .split(' ')
        .filter(Boolean)
        .reduce((abbr, word) => abbr + word[0].toUpperCase(), '');
}

/**
 * Generate a harvest batch ID in the format: MMDDYY[license]ABBREV
 * e.g., "032426[LIC-123456]BD"
 */
export function createHarvestBatchId(licenseNumber: string, strainName: string, date?: Date): string {
    const d = date || new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);

    const dateSegment = `${mm}${dd}${yy}`;
    const abbrev = getStrainAbbrev(strainName);

    return `${dateSegment}[${licenseNumber}]${abbrev}`;
}

/**
 * Generate the fresh frozen batch ID: {batchId}-FF
 */
export function createFreshFrozenBatchId(batchId: string): string {
    return `${batchId}-FF`;
}
