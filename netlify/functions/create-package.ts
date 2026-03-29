import { Handler } from '@netlify/functions';
import { pool } from './utils/db';
import { resolveContext } from './utils/auth';

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const context = await resolveContext(event.headers.authorization);
        if (!context) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        const data = JSON.parse(event.body || '{}');

        // Support single or batch creation
        const packages = Array.isArray(data.packages) ? data.packages : [data];

        if (packages.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'At least one package is required' }) };
        }

        for (const pkg of packages) {
            if (!pkg.label || !pkg.packageType || !pkg.strain || !pkg.licenseNumber || !pkg.quantity) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'label, packageType, strain, licenseNumber, and quantity are required' }),
                };
            }
            if (!['flower', 'trim', 'shake', 'fresh_frozen'].includes(pkg.packageType)) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: 'packageType must be flower, trim, or shake' }),
                };
            }
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const created = [];

            for (const pkg of packages) {
                // Inherit contaminants from harvest for fresh_frozen packages
                let contaminants = pkg.contaminants || [];
                if (pkg.packageType === 'fresh_frozen' && pkg.harvestId && contaminants.length === 0) {
                    const { rows: [harvest] } = await client.query(
                        `SELECT contaminants FROM harvests WHERE id = $1`,
                        [pkg.harvestId]
                    );
                    if (harvest?.contaminants?.length > 0) {
                        contaminants = harvest.contaminants;
                    }
                }

                const { rows: [row] } = await client.query(`
                    INSERT INTO packages (
                        company_id, created_by, harvest_id, trim_entry_id, tag_id,
                        label, package_type, item_name, strain, license_number,
                        quantity, waste_weight, location, notes, contaminants
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    RETURNING *
                `, [
                    context.companyId,
                    context.userId,
                    pkg.harvestId || null,
                    pkg.trimEntryId || null,
                    pkg.tagId || null,
                    pkg.label,
                    pkg.packageType,
                    pkg.itemName || null,
                    pkg.strain,
                    pkg.licenseNumber,
                    pkg.quantity,
                    pkg.wasteWeight || 0,
                    pkg.location || null,
                    pkg.notes || null,
                    contaminants,
                ]);

                // If a tag was specified, mark it as assigned
                if (pkg.tagId) {
                    await client.query(`
                        UPDATE tags SET status = 'assigned', assigned_at = NOW()
                        WHERE id = $1 AND company_id = $2
                    `, [pkg.tagId, context.companyId]);
                }

                created.push(formatPackage(row));
            }

            await client.query('COMMIT');

            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(created.length === 1 ? created[0] : created),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error creating package:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to create package' }),
        };
    }
};

function formatPackage(row: any) {
    return {
        id: row.id,
        harvestId: row.harvest_id,
        trimEntryId: row.trim_entry_id,
        tagId: row.tag_id,
        label: row.label,
        packageType: row.package_type,
        itemName: row.item_name,
        strain: row.strain,
        licenseNumber: row.license_number,
        quantity: parseFloat(row.quantity) || 0,
        unit: row.unit,
        wasteWeight: parseFloat(row.waste_weight) || 0,
        location: row.location,
        notes: row.notes,
        contaminants: row.contaminants || [],
        status: row.status,
        labTestingState: row.lab_testing_state,
        packagedDate: row.packaged_date,
        finishedDate: row.finished_date,
        createdAt: row.created_at,
    };
}
