// @vitest-environment jsdom
/**
 * The picker's connect gate: blocks until the company can reach Metrc, and
 * lets a director connect with a Metrc login (when the server can have T3
 * mint the key) or a pasted T3 secret key. t3api is mocked.
 *
 * Run with:
 *     npx vitest run src/manifest/__tests__/connectMetrcGate.test.tsx
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { MetrcConnectionResponse, MetrcConnectionStatus } from '../../../shared/manifest/metrcConnection'
import type { T3Result } from '../lib/t3api'

const api = vi.hoisted(() => ({
  fetchMetrcConnection: vi.fn<() => Promise<T3Result<MetrcConnectionStatus>>>(),
  connectMetrc: vi.fn<(body: unknown) => Promise<T3Result<MetrcConnectionResponse>>>(),
}))
vi.mock('../lib/t3api', () => api)

import { ConnectMetrcGate } from '../components/ConnectMetrcGate'
import { ManifestAuthContext } from '../lib/authContext'

const empty: MetrcConnectionStatus = { connected: false, source: null, selfServeAvailable: true, metrcLoginAvailable: true, canManage: true, connection: null, env: null }
const connected: MetrcConnectionStatus = {
  ...empty,
  connected: true,
  source: 'connection',
  connection: {
    keyHint: 'ab12', mode: 'read-only', status: 'active', username: 'cwade', hostname: 'mo.metrc.com', hasT3plus: true, subscriptionTier: 'Team', apiAccessLevel: 'full',
    licenses: [{ licenseNumber: 'CUL000030', licenseName: 'Proper', canCreateTransfer: null }], syncLicenses: null, lastVerifiedAt: null, lastSyncedAt: null, lastError: null, lastErrorAt: null,
    createdAt: new Date().toISOString(), createdByName: 'Chris',
  },
}

const mount = () =>
  render(
    <ManifestAuthContext.Provider value={{ email: 'cwade@properbrands.com', logout: vi.fn() }}>
      <ConnectMetrcGate>
        <div>THE PICKER</div>
      </ConnectMetrcGate>
    </ManifestAuthContext.Provider>,
  )

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
})
afterEach(cleanup)

describe('ConnectMetrcGate', () => {
  it('shows the picker straight away when the company is connected', async () => {
    api.fetchMetrcConnection.mockResolvedValue({ ok: true, data: connected })
    mount()
    expect(await screen.findByText('THE PICKER')).toBeTruthy()
  })

  it('leads with a Metrc sign-in, posts the login, and opens the picker after "Start picking"', async () => {
    api.fetchMetrcConnection.mockResolvedValue({ ok: true, data: empty })
    api.connectMetrc.mockResolvedValue({ ok: true, data: { ...connected, warnings: [] } })
    mount()

    expect(await screen.findByRole('form', { name: 'Sign in with Metrc' })).toBeTruthy()
    expect(screen.queryByText('THE PICKER')).toBeNull()
    expect(screen.getByText(/never stores your password/)).toBeTruthy()

    const submit = screen.getByRole('button', { name: /Sign in with Metrc/ }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Metrc state'), { target: { value: 'mo.metrc.com' } })
    fireEvent.change(screen.getByLabelText('Metrc username'), { target: { value: ' cwade ' } })
    fireEvent.change(screen.getByLabelText('Metrc password'), { target: { value: 'hunter2!' } })
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)

    await waitFor(() => expect(api.connectMetrc).toHaveBeenCalledWith({ metrcLogin: { username: 'cwade', password: 'hunter2!', hostname: 'mo.metrc.com' }, mode: 'read-only' }))
    expect(await screen.findByText(/Metrc is connected/)).toBeTruthy()
    expect(screen.getByText(/cwade on mo.metrc.com/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Start picking/ }))
    expect(screen.getByText('THE PICKER')).toBeTruthy()
  })

  it('shows a rejected Metrc login plainly, clears the password, and keeps the form', async () => {
    api.fetchMetrcConnection.mockResolvedValue({ ok: true, data: empty })
    api.connectMetrc.mockResolvedValue({ ok: false, status: 400, code: 'METRC_LOGIN_REJECTED', message: 'Metrc did not accept that username and password for mo.metrc.com.' })
    mount()
    await screen.findByRole('form', { name: 'Sign in with Metrc' })
    fireEvent.change(screen.getByLabelText('Metrc state'), { target: { value: 'mo.metrc.com' } })
    fireEvent.change(screen.getByLabelText('Metrc username'), { target: { value: 'cwade' } })
    fireEvent.change(screen.getByLabelText('Metrc password'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: /Sign in with Metrc/ }))
    expect((await screen.findByText(/did not accept/)).textContent).toMatch(/mo.metrc.com/)
    expect((screen.getByLabelText('Metrc password') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Metrc username') as HTMLInputElement).value).toBe('cwade')
  })

  it('can switch to pasting a T3 key, and offers only that when the server cannot mint keys', async () => {
    api.fetchMetrcConnection.mockResolvedValue({ ok: true, data: empty })
    api.connectMetrc.mockResolvedValue({ ok: true, data: { ...connected, warnings: [] } })
    mount()
    await screen.findByRole('form', { name: 'Sign in with Metrc' })
    fireEvent.click(screen.getByRole('button', { name: /Paste it instead/ }))
    expect(screen.getByRole('form', { name: 'Connect with a T3 secret key' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('T3 secret key'), { target: { value: 'ttt_0123456789abcdef0123456789abcdef' } })
    fireEvent.click(screen.getByRole('button', { name: /Connect Metrc/ }))
    await waitFor(() => expect(api.connectMetrc).toHaveBeenCalledWith({ apiKey: 'ttt_0123456789abcdef0123456789abcdef', mode: 'read-only' }))

    cleanup()
    api.fetchMetrcConnection.mockResolvedValue({ ok: true, data: { ...empty, metrcLoginAvailable: false } })
    mount()
    expect(await screen.findByRole('form', { name: 'Connect with a T3 secret key' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Metrc login instead/ })).toBeNull()
  })

  it('tells a non-director to find one, with no form', async () => {
    api.fetchMetrcConnection.mockResolvedValue({ ok: true, data: { ...empty, canManage: false } })
    mount()
    expect(await screen.findByText(/Only a director or admin can connect Metrc/)).toBeTruthy()
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('fails open when the status call itself fails', async () => {
    api.fetchMetrcConnection.mockResolvedValue({ ok: false, status: 500, message: 'boom' })
    mount()
    expect(await screen.findByText('THE PICKER')).toBeTruthy()
  })
})
