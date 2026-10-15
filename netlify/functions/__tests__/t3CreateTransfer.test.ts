/**
 * t3-create-transfer handler tests. The T3 client is mocked; asserts the
 * endpoint:
 *   - is gated by the manifest access code and by T3_API_KEY
 *   - refuses submit=true in read-only mode but still dry-runs
 *   - resolves ids from T3 and forwards a well-formed payload
 *   - finds the new manifest number after a submit
 *   - maps T3 and validation failures to useful 4xx responses
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { T3Mode } from '../../../shared/manifest/t3';

const resolveContext = vi.fn();
vi.mock('../utils/auth', () => ({ resolveContext: (...a: unknown[]) => resolveContext(...a) }));

const t3 = {
    inputs: vi.fn(),
    destination: vi.fn(),
    transporter: vi.fn(),
    eligible: vi.fn(),
    create: vi.fn(),
    outgoing: vi.fn(),
};
let mode: T3Mode = 'read-only';

vi.mock('../utils/t3', async () => {
    const actual = await vi.importActual<typeof import('../utils/t3')>('../utils/t3');
    return {
        ...actual,
        isT3Configured: () => Boolean(process.env.T3_API_KEY),
        t3Mode: () => mode,
        t3WritesAllowed: () => mode !== 'read-only',
        t3TransferInputs: (...a: unknown[]) => t3.inputs(...a),
        t3Destination: (...a: unknown[]) => t3.destination(...a),
        t3Transporter: (...a: unknown[]) => t3.transporter(...a),
        t3EligibleTransferPackages: (...a: unknown[]) => t3.eligible(...a),
        t3CreateTransfer: (...a: unknown[]) => t3.create(...a),
        t3RecentOutgoing: (...a: unknown[]) => t3.outgoing(...a),
    };
});

import { handler } from '../t3-create-transfer';
import { T3Error } from '../utils/t3';

const TAG_A = '1A40C0300000B55000135918';
const TAG_B = '1A40C0300000B55000135919';
const auth = { 'x-manifest-key': 'secret' };

const body = {
    licenseNumber: 'CUL000030',
    header: { recipientLicense: 'DIS000104', invoiceNumber: '4934', deliveryDate: '2026-09-11', transferType: 'Unaffiliated Transfer', plannedRoute: 'I-44', paymentTermDays: '30' },
    transporter: {
        transporterLicense: 'TRA000033', phone: '3146272579', driverName: 'Tony', driverOccupationalLicense: 'AGT001928', driverLicense: 'G200051004',
        vehicleMake: 'Ford', vehicleModel: 'T250', licensePlate: '76H-3KD', registration: 'Van 1',
    },
    packages: [
        { tag: TAG_A, grossWeightG: 25, wholesalePrice: 140 },
        { tag: TAG_B, grossWeightG: 25, wholesalePrice: 140 },
    ],
    submit: false,
};

function call(payload: unknown, headers: Record<string, string> = auth) {
    return handler(
        { httpMethod: 'POST', headers, body: JSON.stringify(payload) } as Parameters<typeof handler>[0],
        {} as Parameters<typeof handler>[1],
    ) as Promise<{ statusCode: number; body: string }>;
}

beforeEach(() => {
    mode = 'read-only';
    process.env.MANIFEST_ACCESS_CODE = 'secret';
    process.env.T3_API_KEY = 'k';
    delete process.env.DEV_BYPASS_AUTH;
    resolveContext.mockReset();
    resolveContext.mockResolvedValue(null);
    for (const fn of Object.values(t3)) fn.mockReset();
    t3.inputs.mockResolvedValue({
        transferTypes: [
            { id: 7, name: 'Unaffiliated Transfer', forLicensedShipments: true, transactionType: 'Standard' },
            { id: 9, name: 'Wholesale Manifest', forLicensedShipments: true, transactionType: 'Wholesale' },
        ],
        unitsOfMeasure: [{ id: 4, name: 'Grams', abbreviation: 'g' }, { id: 3, name: 'Pounds', abbreviation: 'lb' }],
    });
    t3.destination.mockResolvedValue({ id: 501, licenseNumber: 'DIS000104', facilityName: 'Terrabis - Springfield' });
    t3.transporter.mockResolvedValue({ id: 77, licenseNumber: 'TRA000033', facilityName: 'Proper Transport' });
    t3.eligible.mockResolvedValue(new Map([[TAG_A, { id: 1001, label: TAG_A }], [TAG_B, { id: 1002, label: TAG_B }]]));
    t3.create.mockResolvedValue({ message: 'Dry run' });
    t3.outgoing.mockResolvedValue([]);
});

describe('t3-create-transfer gating', () => {
    it('requires the access code', async () => {
        const res = await call(body, { 'x-manifest-key': 'nope' });
        expect(res.statusCode).toBe(401);
        expect(t3.create).not.toHaveBeenCalled();
    });

    it('explains when T3 is not configured', async () => {
        delete process.env.T3_API_KEY;
        const res = await call(body);
        expect(res.statusCode).toBe(503);
        expect(JSON.parse(res.body).code).toBe('NOT_CONFIGURED');
    });

    it('refuses to submit in read-only mode without touching T3', async () => {
        const res = await call({ ...body, submit: true });
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body).code).toBe('READ_ONLY');
        expect(t3.create).not.toHaveBeenCalled();
    });
});

describe('t3-create-transfer dry run', () => {
    it('resolves ids and forwards a payload without submit', async () => {
        const res = await call(body);
        expect(res.statusCode).toBe(200);
        const out = JSON.parse(res.body);
        expect(out).toMatchObject({ mode: 'read-only', submitted: false, message: 'Dry run', manifestNumber: null, transferId: null });
        expect(out.resolved).toMatchObject({ recipient: { id: 501 }, transporter: { id: 77 }, transferType: { id: 7, name: 'Unaffiliated Transfer' }, packageCount: 2, totalWholesale: 280 });

        expect(t3.create).toHaveBeenCalledTimes(1);
        const [license, payload, submit] = t3.create.mock.calls[0] as [string, { destinations: Record<string, unknown>[] }, boolean];
        expect(license).toBe('CUL000030');
        expect(submit).toBe(false);
        expect(payload.destinations[0]).toMatchObject({ recipientId: 501, transferTypeId: 7, invoiceNumber: '4934' });
        expect(payload.destinations[0].packages).toEqual([
            { id: 1001, wholesalePrice: 140, grossWeight: 25, grossUnitOfWeightId: 4 },
            { id: 1002, wholesalePrice: 140, grossWeight: 25, grossUnitOfWeightId: 4 },
        ]);
        expect(t3.outgoing).not.toHaveBeenCalled();
    });

    it('lists the available types when the name is unknown to Metrc', async () => {
        const res = await call({ ...body, header: { ...body.header, transferType: 'Affiliated Transfer' } });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toMatch(/no transfer type named "Affiliated Transfer".*Unaffiliated Transfer, Wholesale Manifest/);
    });

    it('reports an unknown recipient or transporter licence', async () => {
        t3.destination.mockResolvedValue(null);
        let res = await call(body);
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toMatch(/no transfer destination with licence DIS000104/);

        t3.destination.mockResolvedValue({ id: 501, licenseNumber: 'DIS000104', facilityName: 'x' });
        t3.transporter.mockResolvedValue(null);
        res = await call(body);
        expect(JSON.parse(res.body).error).toMatch(/no transporter with licence TRA000033/);
    });

    it('names packages Metrc will not transfer', async () => {
        t3.eligible.mockResolvedValue(new Map([[TAG_A, { id: 1001, label: TAG_A }]]));
        const res = await call(body);
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body)).toMatchObject({ tags: [TAG_B] });
    });

    it('validates the body before calling T3', async () => {
        const res = await call({ ...body, packages: [{ tag: 'not-a-tag' }] });
        expect(res.statusCode).toBe(400);
        expect(t3.inputs).not.toHaveBeenCalled();
    });

    it('passes T3 errors through with their status', async () => {
        t3.inputs.mockRejectedValue(new T3Error('The Metrc login cannot open the New Transfer form on CUL000030.', 403, 'METRC_RESOURCE_UNAUTHORIZED'));
        const res = await call(body);
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body)).toMatchObject({ code: 'METRC_RESOURCE_UNAUTHORIZED' });
    });
});

describe('t3-create-transfer submit', () => {
    it('submits in live mode and reports the new manifest number', async () => {
        mode = 'live';
        t3.create.mockResolvedValue({ message: 'Success' });
        t3.outgoing
            .mockResolvedValueOnce([{ id: 10, manifestNumber: '0002077900', recipientFacilityLicenseNumber: 'DIS000104' }])
            .mockResolvedValueOnce([
                { id: 11, manifestNumber: '0002077929', recipientFacilityLicenseNumber: 'DIS000104' },
                { id: 10, manifestNumber: '0002077900', recipientFacilityLicenseNumber: 'DIS000104' },
            ]);
        const res = await call({ ...body, submit: true });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toMatchObject({ mode: 'live', submitted: true, message: 'Success', manifestNumber: '0002077929', transferId: 11, warnings: [] });
        expect(t3.create.mock.calls[0][2]).toBe(true);
    });

    it('warns when the new transfer is not listed yet', async () => {
        mode = 'sandbox';
        t3.create.mockResolvedValue({ message: 'Success' });
        t3.outgoing.mockResolvedValue([]);
        const res = await call({ ...body, submit: true });
        const out = JSON.parse(res.body);
        expect(out.manifestNumber).toBeNull();
        expect(out.warnings[0]).toMatch(/not listed yet/);
    }, 10_000);
});
