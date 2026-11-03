import { describe, it, expect } from 'vitest'
import { parsePickList } from '../lib/pickList'
import { DEFAULT_WALK, moveStop, normalizeWalk, sortByVaultOrder, vaultStopLabel } from '../lib/vaultOrder'
import { decideGate } from '../lib/connectionGate'
import { SAMPLE_PICKLIST_CSV } from '../sample/proper4934'
import type { MetrcConnectionStatus } from '../../../shared/manifest/metrcConnection'

const { lines } = parsePickList(SAMPLE_PICKLIST_CSV)

describe('vault walk', () => {
  it('defaults to the stops in code order', () => {
    expect(DEFAULT_WALK[0]).toBe('Goodnight - Gumdrops')
    expect(DEFAULT_WALK).toHaveLength(new Set(DEFAULT_WALK).size)
  })

  it('moves a stop and leaves the rest in order', () => {
    const w = moveStop(DEFAULT_WALK, DEFAULT_WALK.length - 1, 0)
    expect(w[0]).toBe('Proper - Pre-rolls - 1g')
    expect(w.slice(1)).toEqual(DEFAULT_WALK.slice(0, -1))
    expect(moveStop(DEFAULT_WALK, 3, 3)).toBe(DEFAULT_WALK)
    expect(moveStop(DEFAULT_WALK, -1, 2)).toBe(DEFAULT_WALK)
  })

  it('re-sorts a pick list when the walk changes', () => {
    // Default: infused first, then .5g, then 1g. Flip so 1g pre-rolls come first.
    const walk = moveStop(DEFAULT_WALK, DEFAULT_WALK.indexOf('Proper - Pre-rolls - 1g'), 0)
    const sorted = sortByVaultOrder(lines, walk)
    expect(sorted.slice(0, 2).map(vaultStopLabel)).toEqual(['Proper - Pre-rolls - 1g', 'Proper - Pre-rolls - 1g'])
    expect(vaultStopLabel(sorted[sorted.length - 1])).toBe('Proper - Pre-rolls - .5g')
    // Same lines, just reordered: scans keyed by id are unaffected.
    expect(sorted.map((l) => l.id).sort()).toEqual(lines.map((l) => l.id).sort())
  })

  it('repairs a saved walk: drops unknown stops, appends new ones, keeps the saved order', () => {
    const saved = ['Proper - Ounce - 28g', 'Retired stop', 'Goodnight - Gumdrops', 'Goodnight - Gumdrops']
    const w = normalizeWalk(saved)
    expect(w.slice(0, 2)).toEqual(['Proper - Ounce - 28g', 'Goodnight - Gumdrops'])
    expect(w).toHaveLength(DEFAULT_WALK.length)
    expect(new Set(w)).toEqual(new Set(DEFAULT_WALK))
    expect(normalizeWalk('garbage')).toEqual(DEFAULT_WALK)
  })
})

const status = (over: Partial<MetrcConnectionStatus>): MetrcConnectionStatus => ({
  connected: false,
  source: null,
  selfServeAvailable: true,
  metrcLoginAvailable: false,
  canManage: true,
  connection: null,
  env: null,
  ...over,
})

describe('decideGate', () => {
  it('lets a connected company through, by either source', () => {
    expect(decideGate({ ok: true, data: status({ connected: true, source: 'connection' }) }).kind).toBe('open')
    expect(decideGate({ ok: true, data: status({ connected: true, source: 'env', env: { mode: 'read-only' } }) }).kind).toBe('open')
  })

  it('sends a company with no Metrc connection to connect one', () => {
    const d = decideGate({ ok: true, data: status({}) })
    expect(d.kind).toBe('connect')
  })

  it('fails open when the status could not be read', () => {
    expect(decideGate({ ok: false, message: 'offline', status: 0 }).kind).toBe('open')
    expect(decideGate({ ok: false, message: 'migration pending', status: 503, code: 'MIGRATION_PENDING' }).kind).toBe('open')
    expect(decideGate({ ok: false, message: 'not found', status: 404 }).kind).toBe('open')
  })
})
