import { Handler } from '@netlify/functions';
import { authorizeManifestRequest, jsonResponse as json } from './utils/manifestAuth';
import { authorize, type Role } from './utils/auth';
import {
    isT3Configured,
    t3CreateTransfer,
    t3Destination,
    t3EligibleTransferPackages,
    t3Mode,
    t3RecentOutgoing,
    t3TransferInputs,
    t3Transporter,
    t3WritesAllowed,
    T3Error,
} from './utils/t3';
import { buildTransferPayload, isMetrcTag, pickTransferType, pickUnit, TransferValidationError } from './utils/t3Transfer';
import type { T3TransferRequest, T3TransferResponse } from '../../shared/manifest/t3';

/**
 * Creates a Metrc transfer for one origin licence from the manifest picker's
 * scanned packages, through T3. Two-step by design:
 *   submit=false — resolve every id, build the payload, and have T3 validate it
 *                  (static + dynamic). Nothing is written. Works in every T3_MODE.
 *   submit=true  — the same payload is forwarded to Metrc. Refused unless
 *                  T3_MODE is live or sandbox and the caller is a director/admin.
 */

const MAX_PACKAGES = 400;
/** Dry runs are open to anyone in an allowlisted company; writing to Metrc is not. */
const SUBMIT_ROLE: Role = 'director';
const LICENSE_RE = /^[A-Z0-9-]{3,32}$/i;
const MANIFEST_LOOKUP_ATTEMPTS = 3;
const MANIFEST_LOOKUP_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function str(v: unknown): string {
    return typeof v === 'string' ? v : '';
}

function num(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function normalizeBody(raw: unknown): T3TransferRequest | string {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const header = (o.header && typeof o.header === 'object' ? o.header : {}) as Record<string, unknown>;
    const transporter = (o.transporter && typeof o.transporter === 'object' ? o.transporter : {}) as Record<string, unknown>;
    const packages = Array.isArray(o.packages) ? o.packages : [];

    const licenseNumber = str(o.licenseNumber).trim();
    if (!LICENSE_RE.test(licenseNumber)) return 'Pick an origin licence first.';
    if (packages.length === 0) return 'No packages to transfer — scan some first.';
    if (packages.length > MAX_PACKAGES) return `Too many packages (max ${MAX_PACKAGES}).`;

    const normalized: T3TransferRequest = {
        licenseNumber,
        submit: o.submit === true,
        header: {
            recipientLicense: str(header.recipientLicense).trim(),
            invoiceNumber: str(header.invoiceNumber).trim(),
            deliveryDate: str(header.deliveryDate).trim(),
            transferType: str(header.transferType).trim(),
            plannedRoute: str(header.plannedRoute).trim(),
            paymentTermDays: str(header.paymentTermDays).trim(),
        },
        transporter: {
            transporterLicense: str(transporter.transporterLicense).trim(),
            phone: str(transporter.phone).trim(),
            driverName: str(transporter.driverName).trim(),
            driverOccupationalLicense: str(transporter.driverOccupationalLicense).trim(),
            driverLicense: str(transporter.driverLicense).trim(),
            vehicleMake: str(transporter.vehicleMake).trim(),
            vehicleModel: str(transporter.vehicleModel).trim(),
            licensePlate: str(transporter.licensePlate).trim(),
            registration: str(transporter.registration).trim(),
        },
        packages: packages.map(p => {
            const r = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
            return { tag: str(r.tag).trim().toUpperCase(), grossWeightG: num(r.grossWeightG), wholesalePrice: num(r.wholesalePrice) };
        }),
    };

    const badTags = normalized.packages.filter(p => !isMetrcTag(p.tag)).map(p => p.tag);
    if (badTags.length) return `Not Metrc tags: ${badTags.slice(0, 3).join(', ')}`;
    const seen = new Set<string>();
    for (const p of normalized.packages) {
        if (seen.has(p.tag)) return `Tag ${p.tag} appears twice.`;
        seen.add(p.tag);
    }
    if (!LICENSE_RE.test(normalized.header.recipientLicense)) return 'Recipient licence is missing.';
    if (!normalized.header.transferType) return 'Pick a transfer type.';
    return normalized;
}

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const auth = await authorizeManifestRequest(event.headers);
        if (!auth.ok) return json(auth.status, { error: auth.error });
        if (!isT3Configured()) return json(503, { error: 'Metrc transfers are not enabled on this deploy (T3_API_KEY unset).', code: 'NOT_CONFIGURED' });

        const req = normalizeBody(JSON.parse(event.body || '{}'));
        if (typeof req === 'string') return json(400, { error: req });

        const mode = t3Mode();
        if (req.submit && !t3WritesAllowed()) {
            return json(403, {
                error: 'This deploy is in read-only mode (T3_MODE=read-only): transfers can be validated but not submitted to Metrc.',
                code: 'READ_ONLY',
            });
        }
        if (req.submit && authorize(auth.ctx, SUBMIT_ROLE)) {
            return json(403, { error: `Submitting a transfer to Metrc needs the ${SUBMIT_ROLE} or admin role; you are ${auth.ctx.role}.`, code: 'ROLE' });
        }

        const [inputs, recipient, transporter, eligible] = await Promise.all([
            t3TransferInputs(req.licenseNumber),
            t3Destination(req.licenseNumber, req.header.recipientLicense),
            t3Transporter(req.licenseNumber, req.transporter.transporterLicense),
            t3EligibleTransferPackages(req.licenseNumber, req.packages.map(p => p.tag)),
        ]);

        const types = inputs.transferTypes ?? [];
        const transferType = pickTransferType(types, req.header.transferType);
        if (!transferType) {
            const available = types.filter(t => t.forLicensedShipments !== false).map(t => t.name);
            return json(400, { error: `Metrc has no transfer type named "${req.header.transferType}" on ${req.licenseNumber}. Available: ${available.join(', ') || 'none'}.` });
        }
        if (!recipient) return json(400, { error: `Metrc has no transfer destination with licence ${req.header.recipientLicense} for ${req.licenseNumber}. Check the recipient licence.` });
        if (!transporter) return json(400, { error: `Metrc has no transporter with licence ${req.transporter.transporterLicense} for ${req.licenseNumber}. Check the transporter licence in Settings.` });

        const units = inputs.unitsOfMeasure ?? [];
        const packageIds = new Map<string, number>();
        for (const [label, p] of eligible) packageIds.set(label, p.id);

        const built = buildTransferPayload(req, {
            recipient: { id: recipient.id, licenseNumber: recipient.licenseNumber, facilityName: recipient.facilityName },
            transporter: { id: transporter.id, licenseNumber: transporter.licenseNumber, facilityName: transporter.facilityName },
            transferType,
            gramsUnitId: pickUnit(units, 'Grams')?.id ?? null,
            poundsUnitId: pickUnit(units, 'Pounds')?.id ?? null,
            packageIds,
        });

        const before = req.submit ? new Set((await t3RecentOutgoing(req.licenseNumber)).map(t => t.id)) : new Set<number>();
        const result = await t3CreateTransfer(req.licenseNumber, built.payload, req.submit);

        let manifestNumber: string | null = null;
        let transferId: number | null = null;
        if (req.submit) {
            for (let attempt = 0; attempt < MANIFEST_LOOKUP_ATTEMPTS && !transferId; attempt++) {
                if (attempt > 0) await sleep(MANIFEST_LOOKUP_DELAY_MS);
                const after = await t3RecentOutgoing(req.licenseNumber);
                const fresh = after.filter(t => !before.has(t.id));
                const match =
                    fresh.find(t => t.recipientFacilityLicenseNumber?.toUpperCase() === req.header.recipientLicense.toUpperCase()) ?? fresh[0];
                if (match) {
                    transferId = match.id;
                    manifestNumber = match.manifestNumber ?? null;
                }
            }
            if (!transferId) built.warnings.push('Metrc accepted the transfer but it is not listed yet. Check Transfers → Licensed → Outgoing for the manifest number.');
        }

        const response: T3TransferResponse = {
            mode,
            submitted: req.submit,
            message: result.message ?? (req.submit ? 'Success' : 'Dry run'),
            resolved: built.resolved,
            manifestNumber,
            transferId,
            warnings: built.warnings,
        };
        return json(200, response);
    } catch (error) {
        if (error instanceof TransferValidationError) {
            return json(400, { error: error.message, tags: error.tags });
        }
        if (error instanceof T3Error) {
            console.error('t3-create-transfer: T3 error', error.status, error.code, error.detail);
            return json(error.status >= 500 ? 502 : error.status, { error: error.message, code: error.code });
        }
        console.error('t3-create-transfer error:', error);
        return json(500, { error: 'Internal server error' });
    }
};
