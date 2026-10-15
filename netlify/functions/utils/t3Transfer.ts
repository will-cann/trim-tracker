import type { T3PackageFacts, T3ResolvedTransfer, T3TransferRequest } from '../../../shared/manifest/t3';
import type { T3Package, T3TransferType, T3UnitOfMeasure } from './t3';

/**
 * Pure helpers for turning a picked order into a T3 `POST /v2/transfers/create`
 * payload, and for explaining what Metrc knows about each scanned tag. No I/O
 * here so the rules can be unit-tested against fixtures.
 */

const GRAMS_PER_POUND = 453.592;
const TAG_RE = /^1A4[0-9A-Z]{21}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class TransferValidationError extends Error {
    constructor(message: string, public readonly tags?: string[]) {
        super(message);
        this.name = 'TransferValidationError';
    }
}

export const isMetrcTag = (tag: string) => TAG_RE.test(tag);

/**
 * Metrc wants `YYYY-MM-DDTHH:MM:SS` with no zone, interpreted in the licence's
 * local time. Same window the .t3csv export uses: 12:01 AM departure, 11:59 PM arrival.
 */
export function metrcDateTime(isoDate: string, edge: 'departure' | 'arrival'): string {
    if (!ISO_DATE_RE.test(isoDate)) throw new TransferValidationError('Delivery date must be YYYY-MM-DD.');
    return `${isoDate}T${edge === 'departure' ? '00:01:00' : '23:59:00'}`;
}

export function pickTransferType(types: T3TransferType[], name: string): T3TransferType | null {
    const wanted = name.trim().toLowerCase();
    return types.find(t => t.name?.trim().toLowerCase() === wanted) ?? null;
}

export function pickUnit(units: T3UnitOfMeasure[], name: 'Grams' | 'Pounds'): T3UnitOfMeasure | null {
    const abbr = name === 'Grams' ? 'g' : 'lb';
    return (
        units.find(u => !u.isArchived && u.name?.toLowerCase() === name.toLowerCase()) ??
        units.find(u => !u.isArchived && u.abbreviation?.toLowerCase() === abbr) ??
        null
    );
}

export interface ResolvedIds {
    recipient: { id: number; licenseNumber: string; facilityName: string };
    transporter: { id: number; licenseNumber: string; facilityName: string };
    transferType: T3TransferType;
    gramsUnitId: number | null;
    poundsUnitId: number | null;
    /** tag -> Metrc package id, for every tag in the request */
    packageIds: Map<string, number>;
}

export interface BuiltTransfer {
    payload: Record<string, unknown>;
    resolved: T3ResolvedTransfer;
    warnings: string[];
}

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

/**
 * Builds the single-destination shipment T3 expects. Conditional fields follow
 * the transfer type's flags for weights (Metrc rejects unexpected ones); invoice
 * number and wholesale price are sent whenever we have them, matching what the
 * Metrc form accepts for licensed transfers.
 */
export function buildTransferPayload(req: T3TransferRequest, ids: ResolvedIds): BuiltTransfer {
    const warnings: string[] = [];
    const { header, transporter, packages } = req;
    const type = ids.transferType;

    if (!header.recipientLicense.trim()) throw new TransferValidationError('Recipient licence is required.');
    if (!header.plannedRoute.trim()) throw new TransferValidationError('Planned route is required.');
    if (packages.length === 0) throw new TransferValidationError('No packages to transfer.');

    const missingDriver = (
        [
            [transporter.transporterLicense, 'transporter licence'],
            [transporter.phone, 'phone for questions'],
            [transporter.driverName, 'driver name'],
            [transporter.driverOccupationalLicense, 'driver agent/employee ID'],
            [transporter.driverLicense, "driver's licence number"],
            [transporter.vehicleMake, 'vehicle make'],
            [transporter.vehicleModel, 'vehicle model'],
            [transporter.licensePlate, 'licence plate'],
        ] as const
    )
        .filter(([v]) => !v?.trim())
        .map(([, label]) => label);
    if (missingDriver.length) throw new TransferValidationError(`Transporter profile is missing: ${missingDriver.join(', ')}. Fill it in under Settings.`);
    if (type.requiresVehicleRegistrationNumber && !transporter.registration.trim()) {
        throw new TransferValidationError(`${type.name} requires a vehicle registration number. Add it to the transporter profile.`);
    }

    const unresolved = packages.filter(p => !ids.packageIds.has(p.tag.toUpperCase())).map(p => p.tag);
    if (unresolved.length) {
        throw new TransferValidationError(
            `${unresolved.length} package${unresolved.length === 1 ? ' is' : 's are'} not eligible for transfer from ${req.licenseNumber}. Run "Check packages in Metrc" to see why.`,
            unresolved,
        );
    }

    const wholesale = (type.transactionType ?? type.transactionTypeName ?? '').toLowerCase() === 'wholesale';
    const hasAnyWeight = packages.some(p => p.grossWeightG !== null);
    const missingWeight = packages.filter(p => p.grossWeightG === null).map(p => p.tag);
    const missingPrice = packages.filter(p => p.wholesalePrice === null).map(p => p.tag);

    if (wholesale && missingPrice.length) {
        throw new TransferValidationError(`${type.name} needs a wholesale price on every package; ${missingPrice.length} missing. Enter line totals under Wholesale prices.`, missingPrice);
    }
    if (type.requiresPackagesGrossWeight && missingWeight.length) {
        throw new TransferValidationError(`${type.name} needs a gross weight on every package; ${missingWeight.length} missing.`, missingWeight);
    }
    if (type.requiresInvoiceNumber && !header.invoiceNumber.trim()) {
        throw new TransferValidationError(`${type.name} requires an invoice number.`);
    }
    if ((type.requiresDestinationGrossWeight || type.requiresPackagesGrossWeight) && (ids.gramsUnitId === null || ids.poundsUnitId === null)) {
        throw new TransferValidationError('Could not find Grams/Pounds units of measure on this licence.');
    }
    if (wholesale && type.minimumWholesalePrice != null) {
        const low = packages.filter(p => (p.wholesalePrice ?? 0) < (type.minimumWholesalePrice as number));
        if (low.length) warnings.push(`${low.length} package price${low.length === 1 ? ' is' : 's are'} below Metrc's minimum of $${type.minimumWholesalePrice}.`);
    }
    if (!wholesale && missingPrice.length && missingPrice.length < packages.length) {
        warnings.push(`${missingPrice.length} package${missingPrice.length === 1 ? '' : 's'} without a wholesale price will be sent blank.`);
    }
    if (!type.requiresPackagesGrossWeight && missingWeight.length && hasAnyWeight) {
        warnings.push(`${missingWeight.length} package${missingWeight.length === 1 ? ' has' : 's have'} no unit weight; gross weight left blank for those.`);
    }

    const totalGrossG = round(packages.reduce((s, p) => s + (p.grossWeightG ?? 0), 0), 3);
    const totalWholesale = round(packages.reduce((s, p) => s + (p.wholesalePrice ?? 0), 0), 2);
    const sendPackageWeights = type.requiresPackagesGrossWeight || hasAnyWeight;
    const sendDestinationWeight = type.requiresDestinationGrossWeight || (hasAnyWeight && totalGrossG > 0);

    const packagePayload = packages.map(p => {
        const entry: Record<string, unknown> = { id: ids.packageIds.get(p.tag.toUpperCase()) };
        if (p.wholesalePrice !== null) entry.wholesalePrice = round(p.wholesalePrice, 2);
        if (sendPackageWeights && p.grossWeightG !== null && ids.gramsUnitId !== null) {
            entry.grossWeight = round(p.grossWeightG, 3);
            entry.grossUnitOfWeightId = ids.gramsUnitId;
        }
        return entry;
    });

    const transporterDetail: Record<string, unknown> = {
        driverName: transporter.driverName.trim(),
        driverOccupationalLicenseNumber: transporter.driverOccupationalLicense.trim(),
        driverLicenseNumber: transporter.driverLicense.trim(),
        vehicleMake: transporter.vehicleMake.trim(),
        vehicleModel: transporter.vehicleModel.trim(),
        vehicleLicensePlateNumber: transporter.licensePlate.trim(),
    };
    if (transporter.registration.trim()) transporterDetail.vehicleRegistrationNumber = transporter.registration.trim();

    const destination: Record<string, unknown> = {
        recipientId: ids.recipient.id,
        transferTypeId: type.id,
        plannedRoute: header.plannedRoute.trim(),
        estimatedDepartureDateTime: metrcDateTime(header.deliveryDate, 'departure'),
        estimatedArrivalDateTime: metrcDateTime(header.deliveryDate, 'arrival'),
        transporters: [
            {
                transporterId: ids.transporter.id,
                phoneNumberForQuestions: transporter.phone.trim(),
                isLayover: false,
                transporterDetails: [transporterDetail],
            },
        ],
        packages: packagePayload,
    };
    if (header.invoiceNumber.trim()) destination.invoiceNumber = header.invoiceNumber.trim();
    if (sendDestinationWeight && ids.poundsUnitId !== null) {
        destination.grossWeight = round(totalGrossG / GRAMS_PER_POUND, 4);
        destination.grossUnitOfWeightId = ids.poundsUnitId;
    }

    return {
        payload: { destinations: [destination] },
        resolved: {
            recipient: ids.recipient,
            transporter: ids.transporter,
            transferType: {
                id: type.id,
                name: type.name,
                wholesale,
                requiresDestinationGrossWeight: Boolean(type.requiresDestinationGrossWeight),
                requiresPackagesGrossWeight: Boolean(type.requiresPackagesGrossWeight),
                requiresVehicleRegistrationNumber: Boolean(type.requiresVehicleRegistrationNumber),
            },
            packageCount: packages.length,
            totalGrossG,
            totalWholesale,
        },
        warnings,
    };
}

// ── Package verification ──────────────────────────────────────────────────

function describeIneligible(p: T3Package): string {
    if (p.isInTransit) return 'already on an outgoing transfer';
    if (p.isOnHold) return 'on administrative hold';
    if (p.isFinished) return 'finished';
    if (p.isTestingSample) return 'testing sample';
    const lab = p.labTestingStateName ?? '';
    if (/fail|progress|submitted|awaiting/i.test(lab)) return `lab testing: ${lab}`;
    return 'active but not eligible for transfer';
}

/** Metrc returns source labels as one comma-separated string. */
export function splitLabels(raw: string | null | undefined): string[] {
    if (!raw) return [];
    return raw
        .split(/[,\s;]+/)
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
}

export function packageFacts(tag: string, state: T3PackageFacts['state'], p: T3Package, licenseNumber: string, reason?: string): T3PackageFacts {
    return {
        tag,
        state,
        packageId: p.id,
        licenseNumber,
        itemName: p.item?.name ?? undefined,
        productCategory: p.item?.productCategoryName ?? undefined,
        strainName: p.item?.strainName ?? undefined,
        quantity: p.quantity,
        unit: p.unitOfMeasureAbbreviation ?? p.unitOfMeasureName,
        unitWeight: p.item?.unitWeight ?? null,
        unitWeightUnit: p.item?.unitWeightUnitOfMeasureAbbreviation ?? null,
        sourcePackageLabels: splitLabels(p.sourcePackageLabels),
        productionBatchNumber: p.productionBatchNumber ?? null,
        labTestingState: p.labTestingStateName,
        packagedDate: p.packagedDate ?? null,
        locationName: p.locationName ?? null,
        reason,
    };
}

/**
 * Classifies each scanned tag using three lookups the handler already made:
 * eligible-for-transfer on the origin licence, active on the origin licence,
 * and eligible-for-transfer on the other licences the account can see.
 */
export function classifyPackages(
    tags: string[],
    licenseNumber: string,
    eligible: Map<string, T3Package>,
    active: Map<string, T3Package>,
    elsewhere: Array<{ licenseNumber: string; packages: Map<string, T3Package> }>,
): T3PackageFacts[] {
    return tags.map(raw => {
        const tag = raw.toUpperCase();
        const hit = eligible.get(tag);
        if (hit) return packageFacts(tag, 'eligible', hit, licenseNumber);
        const act = active.get(tag);
        if (act) return packageFacts(tag, 'active_not_eligible', act, licenseNumber, describeIneligible(act));
        for (const other of elsewhere) {
            const o = other.packages.get(tag);
            if (o) return packageFacts(tag, 'other_license', o, other.licenseNumber, `eligible from ${other.licenseNumber}, not ${licenseNumber}`);
        }
        return { tag, state: 'not_found', reason: 'not on any licence this T3 account can see' };
    });
}
