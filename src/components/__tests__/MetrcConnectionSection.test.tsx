/**
 * Settings → Metrc connection card: the self-serve connect flow and the
 * connected state. apiService is mocked.
 *
 * Run with:
 *     npx vitest run src/components/__tests__/MetrcConnectionSection.test.tsx
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { MetrcConnectionResponse, MetrcConnectionStatus } from '../../../shared/manifest/metrcConnection';

const api = vi.hoisted(() => ({
    connectMetrc: vi.fn<(req: unknown) => Promise<MetrcConnectionResponse>>(),
    updateMetrcConnection: vi.fn<(patch: unknown) => Promise<MetrcConnectionResponse>>(),
    disconnectMetrc: vi.fn<() => Promise<MetrcConnectionResponse>>(),
}));
vi.mock('../../services/apiService', () => ({ apiService: api }));

import { MetrcConnectionSection } from '../settings/MetrcConnectionSection';

const empty: MetrcConnectionStatus = { connected: false, source: null, selfServeAvailable: true, canManage: true, connection: null, env: null };
const connected: MetrcConnectionStatus = {
    connected: true, source: 'connection', selfServeAvailable: true, canManage: true, env: null,
    connection: {
        keyHint: 'a9f2', mode: 'read-only', status: 'active', username: 'ops@proper.com', hostname: 'mo.metrc.com',
        hasT3plus: true, subscriptionTier: 'Team', apiAccessLevel: 'full',
        licenses: [{ licenseNumber: 'CUL000030', licenseName: 'Proper Cultivation' }, { licenseNumber: 'MAN000012', licenseName: 'Proper Manufacturing' }],
        syncLicenses: null, lastVerifiedAt: new Date().toISOString(), lastSyncedAt: null, lastError: null, lastErrorAt: null,
        createdAt: new Date().toISOString(), createdByName: 'Brian',
    },
};
const KEY = 'ttt_0123456789abcdef0123456789abcdef';

beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset();
    vi.stubGlobal('confirm', vi.fn(() => true));
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('not connected', () => {
    it('explains the three steps and sends the key with the chosen mode', async () => {
        api.connectMetrc.mockResolvedValue({ ...connected, warnings: [] });
        const onChange = vi.fn();
        render(<MetrcConnectionSection status={empty} onChange={onChange} />);

        expect(screen.getByText(/Sign in to Track & Trace Tools/)).toBeTruthy();
        expect(screen.getByText(/Add T3\+/)).toBeTruthy();
        expect(screen.getByRole('link', { name: /secret-key/ }).getAttribute('href')).toBe('https://api.trackandtrace.tools/v2/pages/secret-key');

        const input = screen.getByLabelText('T3 secret key') as HTMLInputElement;
        expect(input.type).toBe('password');
        const submit = screen.getByRole('button', { name: /Connect Metrc/ }) as HTMLButtonElement;
        expect(submit.disabled).toBe(true);

        fireEvent.change(input, { target: { value: 'short' } });
        expect(submit.disabled).toBe(true);
        fireEvent.change(input, { target: { value: KEY } });
        expect(submit.disabled).toBe(false);

        fireEvent.click(screen.getByLabelText(/Transfers allowed/));
        fireEvent.click(submit);

        await waitFor(() => expect(api.connectMetrc).toHaveBeenCalledWith({ apiKey: KEY, mode: 'live' }));
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(connected));
        expect(screen.getByText(/Start with a dry run/)).toBeTruthy();
    });

    it('shows a rejected key plainly and keeps the form', async () => {
        api.connectMetrc.mockRejectedValue(new Error('T3 rejected that key. Copy it again from api.trackandtrace.tools/v2/pages/secret-key — the whole value, no spaces.'));
        render(<MetrcConnectionSection status={empty} onChange={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('T3 secret key'), { target: { value: KEY } });
        fireEvent.click(screen.getByRole('button', { name: /Connect Metrc/ }));
        expect((await screen.findByRole('alert')).textContent).toMatch(/rejected that key/);
        expect(screen.getByLabelText('T3 secret key')).toBeTruthy();
    });

    it('tells non-managers who can connect, and explains when the server cannot store keys', () => {
        render(<MetrcConnectionSection status={{ ...empty, canManage: false }} onChange={vi.fn()} />);
        expect(screen.getByText(/A director or admin connects Metrc/)).toBeTruthy();
        expect(screen.queryByLabelText('T3 secret key')).toBeNull();
        cleanup();
        render(<MetrcConnectionSection status={{ ...empty, selfServeAvailable: false }} onChange={vi.fn()} />);
        expect(screen.getByText(/cannot store Metrc keys yet/)).toBeTruthy();
    });
});

describe('connected', () => {
    it('shows the login, key hint and licences, and never the key', () => {
        render(<MetrcConnectionSection status={connected} onChange={vi.fn()} />);
        expect(screen.getByText('ops@proper.com')).toBeTruthy();
        expect(screen.getByText('mo.metrc.com')).toBeTruthy();
        expect(screen.getByText('…a9f2')).toBeTruthy();
        expect(screen.getByText('CUL000030')).toBeTruthy();
        expect(screen.getByText('Proper Manufacturing')).toBeTruthy();
        expect(screen.getByText('Connected')).toBeTruthy();
        expect(document.body.textContent).not.toContain(KEY);
    });

    it('unticking a licence narrows the sync; ticking the last one back clears the restriction', async () => {
        const narrowed = { ...connected, connection: { ...connected.connection!, syncLicenses: ['CUL000030'] } };
        api.updateMetrcConnection.mockResolvedValueOnce({ ...narrowed, warnings: [] }).mockResolvedValueOnce({ ...connected, warnings: [] });
        const onChange = vi.fn();
        const { rerender } = render(<MetrcConnectionSection status={connected} onChange={onChange} />);

        fireEvent.click(screen.getByLabelText('Sync MAN000012'));
        await waitFor(() => expect(api.updateMetrcConnection).toHaveBeenCalledWith({ syncLicenses: ['CUL000030'] }));
        rerender(<MetrcConnectionSection status={narrowed} onChange={onChange} />);

        fireEvent.click(screen.getByLabelText('Sync MAN000012'));
        await waitFor(() => expect(api.updateMetrcConnection).toHaveBeenLastCalledWith({ syncLicenses: null }));
    });

    it('changes mode, pauses, re-checks and disconnects through the API', async () => {
        api.updateMetrcConnection.mockResolvedValue({ ...connected, warnings: [] });
        api.disconnectMetrc.mockResolvedValue({ ...empty, warnings: [] });
        const onChange = vi.fn();
        render(<MetrcConnectionSection status={connected} onChange={onChange} />);

        fireEvent.change(screen.getByLabelText('Connection mode'), { target: { value: 'live' } });
        await waitFor(() => expect(api.updateMetrcConnection).toHaveBeenCalledWith({ mode: 'live' }));

        fireEvent.click(screen.getByRole('button', { name: /Pause schedule/ }));
        await waitFor(() => expect(api.updateMetrcConnection).toHaveBeenCalledWith({ status: 'paused' }));

        fireEvent.click(screen.getByRole('button', { name: /Re-check/ }));
        await waitFor(() => expect(api.updateMetrcConnection).toHaveBeenCalledWith({ verify: true }));

        fireEvent.click(screen.getByRole('button', { name: /Disconnect/ }));
        await waitFor(() => expect(api.disconnectMetrc).toHaveBeenCalled());
        expect(onChange).toHaveBeenLastCalledWith(empty);
    });

    it('surfaces warnings from the server and a stale key', () => {
        render(<MetrcConnectionSection status={{ ...connected, connected: false }} onChange={vi.fn()} />);
        expect(screen.getByRole('alert').textContent).toMatch(/can no longer be read/);
    });

    it('describes a deploy-managed connection without a form', () => {
        render(<MetrcConnectionSection status={{ ...empty, connected: true, source: 'env', env: { mode: 'read-only' } }} onChange={vi.fn()} />);
        expect(screen.getByText(/Connected by NeuroCann for this deploy/)).toBeTruthy();
        expect(screen.queryByLabelText('T3 secret key')).toBeNull();
    });
});
