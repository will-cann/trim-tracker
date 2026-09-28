import { csvRow } from './csv'
import type { DestinationHeader, PackageRow, TransporterProfile } from '../types'

/**
 * Three-row header of the T3 (Track & Trace Tools) `.t3csv` template for the
 * Metrc "Create Transfer" form, exactly as exported from T3's CSV Form Fill.
 */
const HEADER_ROWS: string[][] = [
  [
    ...Array<string>(9).fill('destination in line.Destinations'),
    ...Array<string>(3).fill('transporter in destination.Transporters'),
    ...Array<string>(10).fill('transporterDetail in transporter.TransporterDetails'),
    ...Array<string>(4).fill('package in destination.Packages'),
  ],
  [
    'destination.RecipientId',
    'destination.PlannedRoute',
    'destination.TransferTypeId',
    'destination.InvoiceNumber',
    'destination.PaymentTermDays',
    'destination.EstimatedDepartureDateTime',
    'destination.EstimatedArrivalDateTime',
    'destination.GrossWeight',
    'destination.GrossUnitOfWeightId',
    'transporter.TransporterId',
    'transporter.PhoneNumberForQuestions',
    'transporter.IsLayover',
    'transporterDetail.DriverId',
    'transporterDetail.DriverName',
    'transporterDetail.DriverOccupationalLicenseNumber',
    'transporterDetail.DriverLicenseNumber',
    'transporterDetail.DriverLayoverLeg',
    'transporterDetail.VehicleId',
    'transporterDetail.VehicleMake',
    'transporterDetail.VehicleModel',
    'transporterDetail.VehicleLicensePlateNumber',
    'transporterDetail.VehicleRegistrationNumber',
    'package.Id',
    'package.WholesalePrice',
    'package.GrossWeight',
    'package.GrossUnitOfWeightId',
  ],
  [
    'License Number',
    'Planned Route',
    'Type',
    'Destination Invoice Number',
    'Payment Terms',
    'Destination Estimated Departure Date Time',
    'Destination Estimated Arrival Date Time',
    'Destination Gross Weight',
    'Destination Gross Weight',
    'License Number',
    'Phone No.',
    'Layover',
    'Driver Name',
    "Driver's Name",
    'Transporter Detail Driver Occupational License Number',
    "Driver's Lic. No.",
    'Layover Leg',
    'Vehicle Make, Model, Or License Plate',
    'Vehicle Make',
    'Vehicle Model',
    'License Plate',
    'Registration Number',
    'Package',
    'Package Wholesale Price',
    'Gross Weight',
    'Gross Weight',
  ],
]

export const T3_COLUMN_COUNT = HEADER_ROWS[1].length

const GRAMS_PER_POUND = 453.592

/** "2026-09-11" -> "09/11/2026" */
function usDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso
}

export function formatMoney(v: number | null): string {
  return v === null ? '' : v.toFixed(2)
}

function formatGrams(v: number | null): string {
  if (v === null) return ''
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000)
}

export interface T3File {
  originLicense: string
  filename: string
  content: string
  packageCount: number
  totalGrossG: number
  totalWholesale: number
}

/** One `.t3csv` per origin licence: Metrc transfers are created per licence. */
export function buildT3Files(
  rows: PackageRow[],
  header: DestinationHeader,
  transporter: TransporterProfile,
  invoiceLabel: string,
): T3File[] {
  const byLicense = new Map<string, PackageRow[]>()
  for (const r of rows) {
    const list = byLicense.get(r.originLicense) ?? []
    list.push(r)
    byLicense.set(r.originLicense, list)
  }

  const files: T3File[] = []
  for (const [license, pkgs] of byLicense) {
    const totalGrossG = pkgs.reduce((s, p) => s + (p.grossWeightG ?? 0), 0)
    const totalLb = Math.round((totalGrossG / GRAMS_PER_POUND) * 10000) / 10000
    const date = usDate(header.deliveryDate)
    const lines = HEADER_ROWS.map(csvRow)
    for (const p of pkgs) {
      lines.push(
        csvRow([
          header.recipientLicense,
          header.plannedRoute,
          header.transferType,
          header.invoiceNumber,
          header.paymentTermDays,
          date ? `${date} 12:01 AM` : '',
          date ? `${date} 11:59 PM` : '',
          totalGrossG > 0 ? totalLb : '',
          totalGrossG > 0 ? 'Pounds' : '',
          transporter.transporterLicense,
          transporter.phone,
          'False',
          transporter.driverName,
          transporter.driverName,
          transporter.driverOccupationalLicense,
          transporter.driverLicense,
          '',
          transporter.licensePlate,
          transporter.vehicleMake,
          transporter.vehicleModel,
          transporter.licensePlate,
          transporter.registration,
          p.tag,
          formatMoney(p.wholesalePrice),
          formatGrams(p.grossWeightG),
          p.grossWeightG === null ? '' : 'Grams',
        ]),
      )
    }
    files.push({
      originLicense: license,
      filename: `${invoiceLabel}_${license}_transfer.t3csv`,
      content: lines.join('\n') + '\n',
      packageCount: pkgs.length,
      totalGrossG,
      totalWholesale: pkgs.reduce((s, p) => s + (p.wholesalePrice ?? 0), 0),
    })
  }
  return files.sort((a, b) => a.originLicense.localeCompare(b.originLicense))
}
