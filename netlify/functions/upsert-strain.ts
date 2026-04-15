import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext } from './utils/auth';

// Canonical 9-bucket terpene taxonomy. Extend here when new buckets are added.
// Storing as text[] in Postgres; validation lives in this endpoint so schema
// changes aren't required to grow the taxonomy.
const TERPENE_TAGS = new Set([
    'gassy',
    'citrus',
    'floral',
    'sweet_dessert',
    'earthy_pine',
    'creamy',
    'fruit',
    'spicy_herbal',
    'candy',
]);
const PHENOTYPES = new Set(['sativa', 'indica', 'hybrid']);
const MAX_TERPENE_TAGS = 3;

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const {
            name,
            defaultFloweringDays,
            defaultVegDays,
            stretchTrait,
            notes,
            phenotype,
            terpeneTags,
        } = body;

        if (!name?.trim()) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Strain name is required' }) };
        }

        const trimmedName = name.trim();
        const floweringDays = (typeof defaultFloweringDays === 'number' && defaultFloweringDays > 0 && defaultFloweringDays <= 120)
            ? defaultFloweringDays
            : null;
        const vegDays = (typeof defaultVegDays === 'number' && defaultVegDays > 0 && defaultVegDays <= 120)
            ? defaultVegDays
            : null;

        const notesVal = typeof notes === 'string' ? notes : undefined;
        const validStretch = ['low', 'medium', 'high'];
        const stretchVal = validStretch.includes(stretchTrait) ? stretchTrait : undefined;

        // Variety-planner attributes. `undefined` means "caller didn't send"
        // (preserve existing value); `null` / empty means "clear it".
        const phenotypeVal = phenotype === undefined
            ? undefined
            : (phenotype === null || phenotype === '' ? null : (PHENOTYPES.has(phenotype) ? phenotype : undefined));

        let terpeneTagsVal: string[] | null | undefined = undefined;
        if (terpeneTags !== undefined) {
            if (terpeneTags === null) {
                terpeneTagsVal = null;
            } else if (Array.isArray(terpeneTags)) {
                const cleaned = terpeneTags
                    .map((t: unknown) => String(t).toLowerCase().trim())
                    .filter((t: string) => TERPENE_TAGS.has(t));
                // Dedupe + cap at 3 (policy: "up to 3 terpenes per strain").
                const deduped = Array.from(new Set(cleaned)).slice(0, MAX_TERPENE_TAGS);
                terpeneTagsVal = deduped.length ? deduped : null;
            }
        }

        // Upsert — insert if not exists, update fields if provided.
        // Cost/g and expected_yield_pct intentionally NOT on this table —
        // both are context-dependent (per product form / per extraction
        // route). Cost comes from vendor_products (migration 064);
        // yield comes from strain_yield_overrides + extraction_logs
        // (migration 065). The upcoming get-strain-pricing aggregator
        // will surface them at query time.
        const result = await sql`
            INSERT INTO strains (
                company_id, name,
                default_flowering_days, default_veg_days, stretch_trait, notes,
                phenotype, terpene_tags
            )
            VALUES (
                ${context.companyId}, ${trimmedName},
                ${floweringDays}, ${vegDays}, ${stretchVal ?? null}, ${notesVal ?? null},
                ${phenotypeVal ?? null}, ${terpeneTagsVal ?? null}
            )
            ON CONFLICT (company_id, LOWER(name)) DO UPDATE SET
                default_flowering_days = COALESCE(${floweringDays}, strains.default_flowering_days),
                default_veg_days = COALESCE(${vegDays}, strains.default_veg_days),
                stretch_trait = CASE WHEN ${stretchVal !== undefined} THEN ${stretchVal ?? null} ELSE strains.stretch_trait END,
                notes = CASE WHEN ${notesVal !== undefined} THEN ${notesVal ?? null} ELSE strains.notes END,
                phenotype = CASE WHEN ${phenotypeVal !== undefined} THEN ${phenotypeVal ?? null} ELSE strains.phenotype END,
                terpene_tags = CASE WHEN ${terpeneTagsVal !== undefined} THEN ${terpeneTagsVal ?? null}::text[] ELSE strains.terpene_tags END,
                updated_at = NOW()
            RETURNING id, name, default_flowering_days, default_veg_days, stretch_trait, notes,
                      phenotype, terpene_tags,
                      created_at, updated_at
        `;

        const strain = result.rows[0];

        return {
            statusCode: 201,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: strain.id,
                name: strain.name,
                defaultVegDays: strain.default_veg_days || null,
                defaultFloweringDays: strain.default_flowering_days || null,
                stretchTrait: strain.stretch_trait || null,
                notes: strain.notes || null,
                phenotype: strain.phenotype || null,
                terpeneTags: strain.terpene_tags || null,
                createdAt: strain.created_at,
                updatedAt: strain.updated_at,
            }),
        };
    } catch (error) {
        console.error('Error upserting strain:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to create strain' }),
        };
    }
};
