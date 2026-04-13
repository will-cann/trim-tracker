import { Handler } from '@netlify/functions';
import { sql } from './utils/db';
import { resolveContext, authorize } from './utils/auth';

export const handler: Handler = async (event) => {
    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        // Write operations require director+; reads are open to all authenticated users
        if (event.httpMethod !== 'GET') {
            const denied = authorize(context, 'director');
            if (denied) return denied;
        }

        // GET — list tags or stats
        if (event.httpMethod === 'GET') {
            const params = event.queryStringParameters || {};

            if (params.action === 'stats') {
                const result = await sql`
                    SELECT
                        COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE status = 'available')::int AS available,
                        COUNT(*) FILTER (WHERE status = 'assigned')::int AS assigned,
                        COUNT(*) FILTER (WHERE status = 'voided')::int AS voided
                    FROM tags
                    WHERE company_id = ${context.companyId}
                `;
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(result.rows[0]),
                };
            }

            // List tags with optional filters
            const status = params.status || null;
            const tagType = params.type || null;
            const limit = Math.min(parseInt(params.limit || '200'), 500);
            const offset = parseInt(params.offset || '0');

            const result = await sql`
                SELECT
                    t.id, t.tag_number, t.tag_type, t.status,
                    t.assigned_to_plant_id, t.assigned_to_batch_id, t.assigned_to_package_id,
                    t.assigned_at, t.created_at,
                    p.label AS plant_label,
                    pb.name AS batch_name,
                    pkg.label AS package_label
                FROM tags t
                LEFT JOIN plants p ON t.assigned_to_plant_id = p.id
                LEFT JOIN plant_batches pb ON t.assigned_to_batch_id = pb.id
                LEFT JOIN packages pkg ON t.assigned_to_package_id = pkg.id
                WHERE t.company_id = ${context.companyId}
                    AND (${status}::text IS NULL OR t.status = ${status})
                    AND (${tagType}::text IS NULL OR t.tag_type = ${tagType})
                ORDER BY t.created_at DESC
                LIMIT ${limit} OFFSET ${offset}
            `;

            const tags = result.rows.map(r => ({
                id: r.id,
                tagNumber: r.tag_number,
                tagType: r.tag_type,
                status: r.status,
                assignedToPlantId: r.assigned_to_plant_id || undefined,
                assignedToBatchId: r.assigned_to_batch_id || undefined,
                assignedToPackageId: r.assigned_to_package_id || undefined,
                assignedTo: r.plant_label || r.batch_name || r.package_label || undefined,
                assignedAt: r.assigned_at || undefined,
                createdAt: r.created_at,
            }));

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tags),
            };
        }

        // POST — actions
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { action } = body;

            switch (action) {
                case 'import': {
                    const { tagNumbers, tagType = 'plant' } = body;
                    if (!Array.isArray(tagNumbers) || tagNumbers.length === 0) {
                        return { statusCode: 400, body: JSON.stringify({ error: 'tagNumbers array is required' }) };
                    }
                    if (!['plant', 'batch', 'package'].includes(tagType)) {
                        return { statusCode: 400, body: JSON.stringify({ error: 'tagType must be plant, batch, or package' }) };
                    }

                    let imported = 0;
                    let skipped = 0;
                    for (const num of tagNumbers) {
                        const trimmed = String(num).trim();
                        if (!trimmed) continue;
                        try {
                            await sql`
                                INSERT INTO tags (company_id, tag_number, tag_type)
                                VALUES (${context.companyId}, ${trimmed}, ${tagType})
                                ON CONFLICT (company_id, tag_number) DO NOTHING
                            `;
                            imported++;
                        } catch {
                            skipped++;
                        }
                    }

                    return {
                        statusCode: 201,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ imported, skipped }),
                    };
                }

                case 'assign': {
                    const { tagId, plantId, batchId, packageId } = body;
                    if (!tagId || (!plantId && !batchId && !packageId)) {
                        return { statusCode: 400, body: JSON.stringify({ error: 'tagId and one of plantId, batchId, or packageId required' }) };
                    }

                    // Verify tag belongs to company and is available
                    const tagCheck = await sql`
                        SELECT id, tag_number FROM tags
                        WHERE id = ${tagId} AND company_id = ${context.companyId} AND status = 'available'
                    `;
                    if (tagCheck.rows.length === 0) {
                        return { statusCode: 400, body: JSON.stringify({ error: 'Tag not found or not available' }) };
                    }

                    const tagNumber = tagCheck.rows[0].tag_number;

                    if (plantId) {
                        await sql`UPDATE plants SET tag = ${tagNumber} WHERE id = ${plantId} AND company_id = ${context.companyId}`;
                        await sql`
                            UPDATE tags SET status = 'assigned', assigned_to_plant_id = ${plantId}, assigned_at = NOW()
                            WHERE id = ${tagId}
                        `;
                    } else if (batchId) {
                        await sql`UPDATE plant_batches SET tag = ${tagNumber} WHERE id = ${batchId} AND company_id = ${context.companyId}`;
                        await sql`
                            UPDATE tags SET status = 'assigned', assigned_to_batch_id = ${batchId}, assigned_at = NOW()
                            WHERE id = ${tagId}
                        `;
                    } else {
                        await sql`UPDATE packages SET tag_id = ${tagId} WHERE id = ${packageId} AND company_id = ${context.companyId}`;
                        await sql`
                            UPDATE tags SET status = 'assigned', assigned_to_package_id = ${packageId}, assigned_at = NOW()
                            WHERE id = ${tagId}
                        `;
                    }

                    return {
                        statusCode: 200,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ success: true, tagNumber }),
                    };
                }

                case 'unassign': {
                    const { tagId } = body;
                    if (!tagId) {
                        return { statusCode: 400, body: JSON.stringify({ error: 'tagId required' }) };
                    }

                    const tag = await sql`
                        SELECT id, tag_number, assigned_to_plant_id, assigned_to_batch_id, assigned_to_package_id
                        FROM tags WHERE id = ${tagId} AND company_id = ${context.companyId}
                    `;
                    if (tag.rows.length === 0) {
                        return { statusCode: 404, body: JSON.stringify({ error: 'Tag not found' }) };
                    }

                    const row = tag.rows[0];
                    if (row.assigned_to_plant_id) {
                        await sql`UPDATE plants SET tag = NULL WHERE id = ${row.assigned_to_plant_id}`;
                    }
                    if (row.assigned_to_batch_id) {
                        await sql`UPDATE plant_batches SET tag = NULL WHERE id = ${row.assigned_to_batch_id}`;
                    }
                    if (row.assigned_to_package_id) {
                        await sql`UPDATE packages SET tag_id = NULL WHERE id = ${row.assigned_to_package_id}`;
                    }

                    await sql`
                        UPDATE tags SET status = 'available', assigned_to_plant_id = NULL, assigned_to_batch_id = NULL, assigned_to_package_id = NULL, assigned_at = NULL
                        WHERE id = ${tagId}
                    `;

                    return {
                        statusCode: 200,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ success: true }),
                    };
                }

                case 'void': {
                    const { tagId } = body;
                    if (!tagId) {
                        return { statusCode: 400, body: JSON.stringify({ error: 'tagId required' }) };
                    }

                    await sql`
                        UPDATE tags SET status = 'voided', assigned_to_plant_id = NULL, assigned_to_batch_id = NULL, assigned_to_package_id = NULL
                        WHERE id = ${tagId} AND company_id = ${context.companyId}
                    `;

                    return {
                        statusCode: 200,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ success: true }),
                    };
                }

                default:
                    return { statusCode: 400, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
            }
        }

        return { statusCode: 405, body: 'Method Not Allowed' };
    } catch (error) {
        console.error('Error in manage-tags:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to manage tags' }) };
    }
};
