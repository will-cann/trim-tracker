/**
 * Pure T3 transfer helpers: payload shape for POST /v2/transfers/create,
 * conditional fields driven by the transfer type's flags, and the
 * per-tag classification used by t3-verify-packages.
 */
import { describe, it, expect } from 'vitest';
import { buildTransferPayload, classifyPackages, metrcDateTime, pickTransferType, pickUnit, splitLabels, TransferValidationError, type ResolvedIds } from '../utils/t3Transfer';
import type { T3Package, T3TransferType } from '../utils/t3';
import type { T3TransferRequest } from '../../../shared/manifest/t3';

const TAG_A = '1A40C0300000B55000135918';
const TAG_B = '1A40C0300000B55000135919';

const unaffiliated: T3TransferType = {
    id: 7,
    name: 'Unaffiliated Transfer',
    forLicensedShipments: true,
    transactionType: 'Standard',
    requiresDestinationGrossWeight: false,
    requiresPackagesGrossWeight: false,
    requiresVehicleRegistrationNumber: false,
};

const wholesale: T3TransferType = { ...unaffiliated, id: 9, name: 'Wholesale Manifest', transactionType: 'Wholesale', minimumWholesalePrice: 0.01 };

const req: T3TransferRequest = {
    licenseNumber: 'CUL000030',
    submit: false,
    header: {
        recipientLicense: 'DIS000104',
        invoiceNumber: '4934',
        deliveryDate: '2026-09-11',
        transferType: 'Unaffiliated Transfer',
        plannedRoute: "See Proper's separate trip plan for detailed directions.",
        paymentTermDays: '30',
    },
    transporter: {
        transporterLicense: 'TRA000033',
        phone: '3146272579',
        driverName: 'Anthony "Tony" Dibello',
        driverOccupationalLicense: 'AGT001928',
        driverLicense: 'G200051004',
        vehicleMake: 'Ford',
        vehicleModel: 'T250',
        licensePlate: '76H-3KD',
        registration: 'Van 1',
    },
    packages: [
        { tag: TAG_A, grossWeightG: 25, wholesalePrice: 140 },
        { tag: TAG_B, grossWeightG: 25, wholesalePrice: 140 },
    ],
};

const ids: ResolvedIds = {
    recipient: { id: 501, licenseNumber: 'DIS000104', facilityName: 'Terrabis - Springfield' },
    transporter: { id: 77, licenseNumber: 'TRA000033', facilityName: 'Proper Transport' },
    transferType: unaffiliated,
    gramsUnitId: 4,
    poundsUnitId: 3,
    packageIds: new Map([
        [TAG_A, 1001],
        [TAG_B, 1002],
    ]),
};

describe('metrcDateTime', () => {
    it('brackets the delivery day in Metrc local-time format', () => {
        expect(metrcDateTime('2026-09-11', 'departure')).toBe('2026-09-11T00:01:00');
        expect(metrcDateTime('2026-09-11', 'arrival')).toBe('2026-09-11T23:59:00');
        expect(() => metrcDateTime('09/11/2026', 'arrival')).toThrow(TransferValidationError);
    });
});

describe('pickTransferType / pickUnit', () => {
    it('matches by name case-insensitively', () => {
        expect(pickTransferType([unaffiliated, wholesale], 'wholesale manifest')?.id).toBe(9);
        expect(pickTransferType([unaffiliated], 'Affiliated Transfer')).toBeNull();
    });
    it('finds units by name, then abbreviation, skipping archived ones', () => {
        const units = [
            { id: 1, name: 'Old Grams', abbreviation: 'g', isArchived: true },
            { id: 4, name: 'Grams', abbreviation: 'g' },
            { id: 3, name: 'Pounds', abbreviation: 'lb' },
        ];
        expect(pickUnit(units, 'Grams')?.id).toBe(4);
        expect(pickUnit(units, 'Pounds')?.id).toBe(3);
        expect(pickUnit([{ id: 9, name: 'Weird', abbreviation: 'lb' }], 'Pounds')?.id).toBe(9);
    });
});

describe('buildTransferPayload', () => {
    it('builds a single-destination shipment with the picker header and transporter', () => {
        const { payload, resolved, warnings } = buildTransferPayload(req, ids);
        const dest = (payload.destinations as Record<string, unknown>[])[0];
        expect(dest).toMatchObject({
            recipientId: 501,
            transferTypeId: 7,
            invoiceNumber: '4934',
            plannedRoute: req.header.plannedRoute,
            estimatedDepartureDateTime: '2026-09-11T00:01:00',
            estimatedArrivalDateTime: '2026-09-11T23:59:00',
            grossWeight: 0.1102,
            grossUnitOfWeightId: 3,
        });
        expect(dest.transporters).toEqual([
            {
                transporterId: 77,
                phoneNumberForQuestions: '3146272579',
                isLayover: false,
                transporterDetails: [
                    {
                        driverName: 'Anthony "Tony" Dibello',
                        driverOccupationalLicenseNumber: 'AGT001928',
                        driverLicenseNumber: 'G200051004',
                        vehicleMake: 'Ford',
                        vehicleModel: 'T250',
                        vehicleLicensePlateNumber: '76H-3KD',
                        vehicleRegistrationNumber: 'Van 1',
                    },
                ],
            },
        ]);
        expect(dest.packages).toEqual([
            { id: 1001, wholesalePrice: 140, grossWeight: 25, grossUnitOfWeightId: 4 },
            { id: 1002, wholesalePrice: 140, grossWeight: 25, grossUnitOfWeightId: 4 },
        ]);
        expect(resolved).toMatchObject({ packageCount: 2, totalGrossG: 50, totalWholesale: 280, transferType: { name: 'Unaffiliated Transfer', wholesale: false } });
        expect(warnings).toEqual([]);
    });

    it('leaves optional fields out when the picker has no value', () => {
        const bare: T3TransferRequest = {
            ...req,
            header: { ...req.header, invoiceNumber: '' },
            transporter: { ...req.transporter, registration: '' },
            packages: [{ tag: TAG_A, grossWeightG: null, wholesalePrice: null }],
        };
        const dest = (buildTransferPayload(bare, ids).payload.destinations as Record<string, unknown>[])[0];
        expect(dest).not.toHaveProperty('invoiceNumber');
        expect(dest).not.toHaveProperty('grossWeight');
        expect(dest.packages).toEqual([{ id: 1001 }]);
        const detail = (dest.transporters as { transporterDetails: Record<string, unknown>[] }[])[0].transporterDetails[0];
        expect(detail).not.toHaveProperty('vehicleRegistrationNumber');
    });

    it('requires a price on every package for wholesale types', () => {
        const r: T3TransferRequest = { ...req, packages: [req.packages[0], { tag: TAG_B, grossWeightG: 25, wholesalePrice: null }] };
        expect(() => buildTransferPayload(r, { ...ids, transferType: wholesale })).toThrow(/wholesale price on every package; 1 missing/);
        try {
            buildTransferPayload(r, { ...ids, transferType: wholesale });
        } catch (e) {
            expect((e as TransferValidationError).tags).toEqual([TAG_B]);
        }
    });

    it('requires weights, registration and invoice number when the type says so', () => {
        const strict: T3TransferType = { ...unaffiliated, requiresPackagesGrossWeight: true, requiresVehicleRegistrationNumber: true, requiresInvoiceNumber: true };
        const noWeight: T3TransferRequest = { ...req, packages: [{ tag: TAG_A, grossWeightG: null, wholesalePrice: 1 }] };
        expect(() => buildTransferPayload(noWeight, { ...ids, transferType: strict })).toThrow(/gross weight on every package/);
        const noReg: T3TransferRequest = { ...req, transporter: { ...req.transporter, registration: '' } };
        expect(() => buildTransferPayload(noReg, { ...ids, transferType: strict })).toThrow(/vehicle registration number/);
        const noInvoice: T3TransferRequest = { ...req, header: { ...req.header, invoiceNumber: '' } };
        expect(() => buildTransferPayload(noInvoice, { ...ids, transferType: strict })).toThrow(/requires an invoice number/);
    });

    it('refuses packages Metrc did not list as eligible and names them', () => {
        const partial = { ...ids, packageIds: new Map([[TAG_A, 1001]]) };
        expect(() => buildTransferPayload(req, partial)).toThrow(/1 package is not eligible for transfer from CUL000030/);
        try {
            buildTransferPayload(req, partial);
        } catch (e) {
            expect((e as TransferValidationError).tags).toEqual([TAG_B]);
        }
    });

    it('names missing transporter fields', () => {
        const r: T3TransferRequest = { ...req, transporter: { ...req.transporter, driverName: '', licensePlate: '' } };
        expect(() => buildTransferPayload(r, ids)).toThrow(/driver name, licence plate/);
    });

    it('warns about blanks it will send instead of failing', () => {
        const r: T3TransferRequest = { ...req, packages: [req.packages[0], { tag: TAG_B, grossWeightG: null, wholesalePrice: null }] };
        const { warnings } = buildTransferPayload(r, ids);
        expect(warnings).toEqual(['1 package without a wholesale price will be sent blank.', '1 package has no unit weight; gross weight left blank for those.']);
    });
});

describe('classifyPackages', () => {
    const pkg = (label: string, extra: Partial<T3Package> = {}): T3Package => ({
        id: 1,
        label,
        quantity: 50,
        unitOfMeasureAbbreviation: 'ea',
        item: { name: 'Legend OG Pre-Roll 1g', strainName: 'Legend OG', unitWeight: 1, unitWeightUnitOfMeasureAbbreviation: 'g' },
        sourcePackageLabels: '1A40C030000038B000009173, 1A40C030000038B000009174',
        labTestingStateName: 'TestPassed',
        ...extra,
    });

    it('splits Metrc source labels', () => {
        expect(splitLabels('1A40C030000038B000009173, 1a40c030000038b000009174')).toEqual(['1A40C030000038B000009173', '1A40C030000038B000009174']);
        expect(splitLabels(null)).toEqual([]);
    });

    it('labels each tag by where Metrc found it', () => {
        const eligible = new Map([[TAG_A, pkg(TAG_A)]]);
        const active = new Map([[TAG_B, pkg(TAG_B, { isInTransit: true })]]);
        const other = '1A40C0300000B56000294260';
        const missing = '1A40C0300000B56000294261';
        const elsewhere = [{ licenseNumber: 'MAN000043', packages: new Map([[other, pkg(other)]]) }];

        const out = classifyPackages([TAG_A, TAG_B, other, missing], 'CUL000030', eligible, active, elsewhere);
        expect(out[0]).toMatchObject({
            tag: TAG_A,
            state: 'eligible',
            licenseNumber: 'CUL000030',
            itemName: 'Legend OG Pre-Roll 1g',
            quantity: 50,
            unit: 'ea',
            unitWeight: 1,
            sourcePackageLabels: ['1A40C030000038B000009173', '1A40C030000038B000009174'],
            labTestingState: 'TestPassed',
        });
        expect(out[1]).toMatchObject({ state: 'active_not_eligible', reason: 'already on an outgoing transfer' });
        expect(out[2]).toMatchObject({ state: 'other_license', licenseNumber: 'MAN000043', reason: 'eligible from MAN000043, not CUL000030' });
        expect(out[3]).toMatchObject({ state: 'not_found' });
        expect(out[3].packageId).toBeUndefined();
    });
});
