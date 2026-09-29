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

export interface OrderState {
  loadedAt: number
  sourceName: string
  lines: PickLine[]
  scans: Record<string, Scan[]>
  /** productType -> origin license number */
  licenseByProductType: Record<string, string>
  /** lineId -> invoice line total in dollars (optional, for WholesalePrice) */
  lineTotals: Record<string, string>
  header: DestinationHeader
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
