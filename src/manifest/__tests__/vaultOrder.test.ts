import { describe, it, expect } from 'vitest'
import { parsePickList } from '../lib/pickList'
import { sortByVaultOrder, vaultStop, VAULT_ORDER } from '../lib/vaultOrder'
import { SAMPLE_PICKLIST_CSV } from '../sample/proper4934'
import type { PickLine } from '../types'

function line(brand: string, category: string, productType: string, productName: string): PickLine {
  return {
    id: productName,
    orderNumber: 'Proper-1',
    brand,
    category,
    productType,
    productName,
    lotLabel: '',
    lotTag: null,
    packagesExpected: 1,
    unitsPerPackage: 1,
    totalUnits: 1,
    unitWeightG: null,
    buyer: '',
    buyerLicense: '',
    buyerAddress: '',
    potency: '',
    recordedTags: [],
  }
}

const stop = (l: PickLine) => {
  const i = vaultStop(l)
  return i === null ? null : VAULT_ORDER[i].label
}

describe('vaultStop', () => {
  it.each([
    [line('Goodnight', 'Edible', 'Gummy', 'Goodnight - Gumdrops - 100mg - Blackberry'), 'Goodnight - Gumdrops'],
    [line('Honeybee', 'Edible', 'Chocolate', 'Honeybee - Chocolate Bar - 100mg - Milk'), 'Honeybee - Chocolates'],
    [line('Ratio', 'Edible', 'Mint', 'Ratio - Mints - 1:1 CBD'), 'Ratio - Mints'],
    [line('Daily Driver', 'Preroll', 'Infused Pre-roll', 'Daily Driver - Infused Pre-Roll - 1g - "Full Throttle" - Mix #29'), 'Infused Pre-rolls'],
    [line('Proper Cannabis', 'Vape', 'Cartridge', 'Proper - Sauce+ Cart - 1g - Legend OG'), 'Sauced/Sauce+ Vapes'],
    [line('Proper Cannabis', 'Vape', 'Cartridge', 'Proper - Liquid Diamonds Cart - 1g - Dolato'), 'Liquid Diamonds Carts'],
    [line('Ratio', 'Vape', 'Cartridge', 'Ratio - Vape - 1:1'), 'Ratio Vape'],
    [line('Proper Cannabis', 'Vape', 'All in One', 'Proper - Rosin All in One - .5g - Biscotti'), 'Rosin All in One Vapes'],
    [line('Goodnight', 'Vape', 'Cartridge', 'Goodnight - Vape - 1g'), 'Goodnight - Vapes'],
    [line('Honeybee', 'Edible', 'Gummy', 'Honeybee - Queen Bee - 200mg'), 'Honeybee - Queen Bee'],
    [line('Honeybee', 'Edible', 'Gummy', 'Honeybee - Gumdrops - 300mg - 20ct - Black Cherry Cola'), 'Honeybee - Gumdrops'],
    [line('Proper Cannabis', 'Flower', 'Whole Flower', 'Proper Reserve - 3.5g - Dolato'), 'Proper Reserve - Eighths - 3.5g'],
    [line('Proper Cannabis', 'Flower', 'Whole Flower', 'Proper - Flower - 3.5g - Biscotti'), 'Proper - Eighths - 3.5g'],
    [line('Proper Cannabis', 'Flower', 'Small Bud', 'Proper - Small Bud - 7g - Biscotti'), 'Proper - Small Bud Quarters - 7g'],
    [line('Proper Cannabis', 'Flower', 'Whole Flower', 'Proper - Flower - 14g - Biscotti'), 'Proper - Half Ounce - 14g'],
    [line('Proper Cannabis', 'Flower', 'Whole Flower', 'Proper - Flower - 28g - Biscotti'), 'Proper - Ounce - 28g'],
    [line('Daily Driver', 'Flower', 'Whole Flower', 'Daily Driver - Flower - 3.5g - Dolato'), 'Daily Driver - Eighths - 3.5g'],
    [line('Daily Driver', 'Flower', 'Whole Flower', 'Daily Driver - Flower - 7g - Dolato'), 'Daily Driver - Quarters - 7g'],
    [line('Daily Driver', 'Flower', 'Whole Flower', 'Daily Driver - Flower - 14g - Dolato'), 'Daily Driver - Half Ounce - 14g'],
    [line('Daily Driver', 'Flower', 'Whole Flower', 'Daily Driver - Flower - 28g - Dolato'), 'Daily Driver - Ounce - 28g'],
    [line('Proper Cannabis', 'Preroll', 'Whole Flower', 'Proper - Pre-Rolls - 2.5g - Blank Check'), 'Proper - Pre-rolls - 5pk'],
    [line('Proper Cannabis', 'Preroll', 'Whole Flower', 'Proper - Pre-Roll 5pk - Blank Check'), 'Proper - Pre-rolls - 5pk'],
    [line('Proper Cannabis', 'Preroll', 'Whole Flower', 'Proper - Pre-Roll - .5g - "Legend of Luke" - Mix #129'), 'Proper - Pre-rolls - .5g'],
    [line('Proper Cannabis', 'Preroll', 'Whole Flower', 'Proper - Pre-Roll - 1g - Legend OG'), 'Proper - Pre-rolls - 1g'],
  ])('%#: %s', (l, expected) => {
    expect(stop(l)).toBe(expected)
  })

  it('leaves unknown products unplaced', () => {
    expect(stop(line('Other Co', 'Topical', 'Balm', 'Other Co - Balm - 500mg'))).toBeNull()
  })
})

describe('sortByVaultOrder', () => {
  it('walks the sample order infused → .5g → 1g, keeping Apex order within a stop', () => {
    const { lines } = parsePickList(SAMPLE_PICKLIST_CSV)
    const sorted = sortByVaultOrder(lines)
    expect(sorted).toHaveLength(lines.length)
    expect(sorted.map(stop)).toEqual([...sorted.map(stop)].sort((a, b) => {
      const idx = (s: string | null) => VAULT_ORDER.findIndex((v) => v.label === s)
      return idx(a) - idx(b)
    }))
    const infused = lines.filter((l) => stop(l) === 'Infused Pre-rolls').map((l) => l.id)
    expect(sorted.slice(0, infused.length).map((l) => l.id)).toEqual(infused)
    expect(stop(sorted[sorted.length - 1])).toBe('Proper - Pre-rolls - 1g')
  })

  it('puts unmatched lines last in their original order', () => {
    const a = line('Other Co', 'Topical', 'Balm', 'Balm A')
    const b = line('Other Co', 'Topical', 'Balm', 'Balm B')
    const pr = line('Proper Cannabis', 'Preroll', 'Whole Flower', 'Proper - Pre-Roll - 1g - Legend OG')
    expect(sortByVaultOrder([a, pr, b]).map((l) => l.id)).toEqual([pr.id, a.id, b.id])
  })
})
