import { describe, it, expect } from 'vitest'
import { buildT3Files, T3_COLUMN_COUNT } from '../lib/t3csv'
import type { DestinationHeader, PackageRow, TransporterProfile } from '../types'

const header: DestinationHeader = {
  recipientLicense: 'DIS000104',
  invoiceNumber: '4934',
  deliveryDate: '2026-09-11',
  transferType: 'Unaffiliated Transfer',
  plannedRoute: "See Proper's separate trip plan for detailed directions.",
  paymentTermDays: '30',
}

const transporter: TransporterProfile = {
  transporterLicense: 'TRA000033',
  phone: '3146272579',
  driverName: 'Anthony "Tony" Dibello',
  driverOccupationalLicense: 'AGT001928',
  driverLicense: 'G200051004',
  vehicleMake: 'Ford',
  vehicleModel: 'T250',
  licensePlate: '76H-3KD',
  registration: 'Van 1',
}

const rows: PackageRow[] = [
  { lineId: 'a', originLicense: 'CUL000030', tag: '1A40C0300000B55000135918', productName: 'x', units: 50, grossWeightG: 25, wholesalePrice: 140 },
  { lineId: 'a', originLicense: 'CUL000030', tag: '1A40C0300000B55000135919', productName: 'x', units: 50, grossWeightG: 25, wholesalePrice: 140 },
  { lineId: 'b', originLicense: 'MAN000043', tag: '1A40C0300000B56000294260', productName: 'y', units: 4, grossWeightG: 4, wholesalePrice: 0.04 },
  { lineId: 'c', originLicense: 'MAN000043', tag: '1A40C0300000B56000294261', productName: 'z', units: 20, grossWeightG: null, wholesalePrice: null },
]

describe('buildT3Files', () => {
  const files = buildT3Files(rows, header, transporter, 'Proper-4934')

  it('emits one file per origin licence, sorted', () => {
    expect(files.map((f) => f.originLicense)).toEqual(['CUL000030', 'MAN000043'])
    expect(files[0].filename).toBe('Proper-4934_CUL000030_transfer.t3csv')
    expect(files[0].packageCount).toBe(2)
    expect(files[1].packageCount).toBe(2)
  })

  it('has the exact 3-row T3 header with 26 columns', () => {
    const lines = files[0].content.trimEnd().split('\n')
    expect(T3_COLUMN_COUNT).toBe(26)
    expect(lines[0].startsWith('destination in line.Destinations,')).toBe(true)
    expect(lines[1].startsWith('destination.RecipientId,')).toBe(true)
    expect(lines[1].endsWith(',package.GrossUnitOfWeightId')).toBe(true)
    expect(lines[2]).toContain('"Vehicle Make, Model, Or License Plate"')
    expect(lines).toHaveLength(3 + 2)
  })

  it('writes one row per package with header values repeated and totals per licence', () => {
    const row = files[0].content.trimEnd().split('\n')[3]
    expect(row).toBe(
      'DIS000104,See Proper\'s separate trip plan for detailed directions.,Unaffiliated Transfer,4934,30,' +
        '09/11/2026 12:01 AM,09/11/2026 11:59 PM,0.1102,Pounds,TRA000033,3146272579,False,' +
        '"Anthony ""Tony"" Dibello","Anthony ""Tony"" Dibello",AGT001928,G200051004,,' +
        '76H-3KD,Ford,T250,76H-3KD,Van 1,1A40C0300000B55000135918,140.00,25,Grams',
    )
    expect(files[0].totalGrossG).toBe(50)
    expect(files[0].totalWholesale).toBe(280)
  })

  it('leaves price and weight blank when unknown', () => {
    const manRows = files[1].content.trimEnd().split('\n').slice(3)
    expect(manRows[0]).toMatch(/,1A40C0300000B56000294260,0\.04,4,Grams$/)
    expect(manRows[1]).toMatch(/,1A40C0300000B56000294261,,,$/)
  })
})
