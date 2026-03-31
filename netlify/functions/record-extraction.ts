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

        const {
            sourcePackageId,
            inputPackageType,
            inputQuantity,
            outputPackageType,
            outputQuantity,
            outputLabel,
            strain,
            licenseNumber,
            wasteWeight = 0,
            notes,
        } = data;

        if (!inputPackageType || !outputPackageType || !strain) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'inputPackageType, outputPackageType, and strain are required' }),
            };
        }

        const validTypes = ['fresh_frozen', 'bubble_hash', 'rosin', 'rosin_cart'];
        if (!validTypes.includes(inputPackageType) || !validTypes.includes(outputPackageType)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: `Invalid package type. Must be one of: ${validTypes.join(', ')}` }),
            };
        }

        // Derive extraction type from the stage transition
        const extractionType = deriveExtractionType(inputPackageType, outputPackageType);

        // Unit is 'Each' for carts, 'Grams' for everything else
        const unit = outputPackageType === 'rosin_cart' ? 'Each' : 'Grams';

        // Calculate yield if both input and output are known
        const yieldPercentage = outputQuantity && inputQuantity
            ? parseFloat(((outputQuantity / inputQuantity) * 100).toFixed(2))
            : null;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Step 1: Decrement source package quantity (if source and quantity provided)
            if (sourcePackageId && inputQuantity) {
                const { rows: [source] } = await client.query(
                    `SELECT quantity FROM packages WHERE id = $1 AND company_id = $2`,
                    [sourcePackageId, context.companyId]
                );

                if (!source) {
                    await client.query('ROLLBACK');
                    return {
                        statusCode: 404,
                        body: JSON.stringify({ error: 'Source package not found' }),
                    };
                }

                const currentQty = parseFloat(source.quantity);
                if (currentQty < inputQuantity) {
                    await client.query('ROLLBACK');
                    return {
                        statusCode: 400,
                        body: JSON.stringify({
                            error: `Insufficient source quantity: ${currentQty}g available, ${inputQuantity}g requested`,
                        }),
                    };
                }

                await client.query(
                    `UPDATE packages SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
                    [inputQuantity, sourcePackageId]
                );
            }

            // Step 2: Create output package (if output quantity is known)
            let outputPackageId: string | null = null;
            let outputRow: any = null;

            if (outputQuantity) {
                const label = outputLabel ||
                    `${strain}-${outputPackageType.replace('_', '-').toUpperCase()}-${new Date().toISOString().slice(0, 10)}`;

                const { rows: [row] } = await client.query(`
                    INSERT INTO packages (
                        company_id, created_by, source_package_id, input_quantity,
                        label, package_type, strain, license_number,
                        quantity, unit, waste_weight, notes
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    RETURNING *
                `, [
                    context.companyId,
                    context.userId,
                    sourcePackageId || null,
                    inputQuantity,
                    label,
                    outputPackageType,
                    strain,
                    licenseNumber || null,
                    outputQuantity,
                    unit,
                    wasteWeight,
                    notes || null,
                ]);

                outputPackageId = row.id;
                outputRow = row;
            }

            // Step 3: Insert extraction log
            const { rows: [logRow] } = await client.query(`
                INSERT INTO extraction_logs (
                    company_id, created_by,
                    source_package_id, input_package_type, input_quantity,
                    output_package_id, output_package_type, output_quantity,
                    strain, license_number, extraction_type,
                    yield_percentage, waste_weight, notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING *
            `, [
                context.companyId,
                context.userId,
                sourcePackageId || null,
                inputPackageType,
                inputQuantity || null,
                outputPackageId,
                outputPackageType,
                outputQuantity || null,
                strain,
                licenseNumber || null,
                extractionType,
                yieldPercentage,
                wasteWeight,
                notes || null,
            ]);

            await client.query('COMMIT');

            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    package: outputRow ? formatPackage(outputRow) : null,
                    log: formatLog(logRow),
                }),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error recording extraction:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to record extraction' }),
        };
    }
};

function deriveExtractionType(input: string, output: string): string {
    if (input === 'fresh_frozen' && output === 'bubble_hash') return 'ice_water';
    if (input === 'bubble_hash' && output === 'rosin') return 'rosin_press';
    if (input === 'rosin' && output === 'rosin_cart') return 'cart_fill';
    return 'other';
}

function formatPackage(row: any) {
    return {
        id: row.id,
        sourcePackageId: row.source_package_id,
        inputQuantity: parseFloat(row.input_quantity) || null,
        label: row.label,
        packageType: row.package_type,
        strain: row.strain,
        licenseNumber: row.license_number,
        quantity: parseFloat(row.quantity) || 0,
        unit: row.unit,
        wasteWeight: parseFloat(row.waste_weight) || 0,
        notes: row.notes,
        status: row.status,
        labTestingState: row.lab_testing_state,
        packagedDate: row.packaged_date,
        createdAt: row.created_at,
    };
}

function formatLog(row: any) {
    return {
        id: row.id,
        sourcePackageId: row.source_package_id,
        inputPackageType: row.input_package_type,
        inputQuantity: parseFloat(row.input_quantity) || 0,
        outputPackageId: row.output_package_id,
        outputPackageType: row.output_package_type,
        outputQuantity: row.output_quantity ? parseFloat(row.output_quantity) : null,
        strain: row.strain,
        licenseNumber: row.license_number,
        extractionType: row.extraction_type,
        yieldPercentage: row.yield_percentage ? parseFloat(row.yield_percentage) : null,
        wasteWeight: parseFloat(row.waste_weight) || 0,
        notes: row.notes,
        createdAt: row.created_at,
    };
}
