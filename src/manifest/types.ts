import type { T3Mode, T3PackageFacts } from '../../shared/manifest/t3'

export interface PickLine {
  id: string
  orderNumber: string
  brand: string
  category: string
  productType: string
  productName: string
  /** Apex "Product SKU" — often blank or a copy of the name. Optional for orders saved before it was captured. */
  sku?: string
  /** Full "Batch ID" text from Apex, e.g. "Proper - Pre-Roll - 1g - Legend OG #1A40C0300000..." */
  lotLabel: string
  /** Parent Metrc package tag extracted from the Batch ID, if present */
  lotTag: string | null
  /** Number of physical packages (cases) the picker must scan for this line */
  packagesExpected: number
  unitsPerPackage: number
  totalUnits: number
  /** Per-unit weight in grams parsed from the product name, if present */
  unitWeightG: number | null
  buyer: string
  buyerLicense: string
  buyerAddress: string
  potency: string
  /** Tags already recorded in Apex's Note / Metrc Package ID columns */
  recordedTags: string[]
}

/** camera = phone camera, manual = typed, usb = keyboard-wedge scanner on a laptop, recorded = imported from Apex */
export type ScanSource = 'camera' | 'manual' | 'usb' | 'recorded'

export interface Scan {
  tag: string
  at: number
  source: ScanSource
}

export interface DestinationHeader {
  recipientLicense: string
  invoiceNumber: string
  /** ISO date (YYYY-MM-DD). Departure is 12:01 AM, arrival 11:59 PM that day. */
  deliveryDate: string
  transferType: string
  plannedRoute: string
  paymentTermDays: string
}

export interface TransporterProfile {
  transporterLicense: string
  phone: string
  driverName: string
  driverOccupationalLicense: string
  driverLicense: string
  vehicleMake: string
  vehicleModel: string
  licensePlate: string
  registration: string
}

/** What the attached invoice said about one pick line, kept so Metrc checks can use it after a reload. */
export interface InvoiceLineRef {
  description: string
  /** Sellable units billed; null when the invoice did not print one. */
  quantity: number | null
  total: number
}

/** Snapshot of what Metrc (via T3) reported for the scanned tags. */
export interface MetrcSnapshot {
  checkedAt: number
  mode: T3Mode
  byTag: Record<string, T3PackageFacts>
}

export interface MetrcTransferRecord {
  manifestNumber: string | null
  transferId: number | null
  submittedAt: number
  mode: T3Mode
}

export interface OrderState {
  loadedAt: number
  sourceName: string
  lines: PickLine[]
  scans: Record<string, Scan[]>
  /** productType -> origin license number */
  licenseByProductType: Record<string, string>
  /** lineId -> invoice line total in dollars (optional, for WholesalePrice) */
  lineTotals: Record<string, string>
  /** lineId -> matched invoice line (optional; set when an invoice is attached) */
  invoiceLines?: Record<string, InvoiceLineRef>
  header: DestinationHeader
  /** Last Metrc lookup of the scanned tags (optional). */
  metrc?: MetrcSnapshot
  /** originLicense -> transfer submitted to Metrc from this order (optional). */
  metrcTransfers?: Record<string, MetrcTransferRecord>
}

export interface PackageRow {
  lineId: string
  originLicense: string
  tag: string
  productName: string
  units: number
  grossWeightG: number | null
  wholesalePrice: number | null
}
