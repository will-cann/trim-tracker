/**
 * Wire contract between the manifest picker (src/manifest) and the T3 proxy
 * functions (netlify/functions/t3-*.ts). T3 is Track & Trace Tools' Metrc
 * API; the picker never talks to it directly because the secret key grants
 * the full permissions of the Metrc login behind it and lives only in the
 * server environment (T3_API_KEY).
 */

/**
 * read-only — real Metrc data; transfer creation is validated (dry run) but never submitted
 * sandbox   — the key is exchanged for a Metrc sandbox session (sandbox-<state>.metrc.com);
 *             writes are allowed because they land in the sandbox, not production
 * live      — real Metrc data and real writes
 */
export type T3Mode = 'read-only' | 'sandbox' | 'live'

export interface T3License {
  licenseNumber: string
  licenseName: string
  /** Metrc grants the login `packages:new_transfer` on this licence (null = could not check). */
  canCreateTransfer?: boolean | null
}

export interface T3Status {
  /** T3_API_KEY is set on this deploy. */
  configured: boolean
  mode: T3Mode
  /** The key authenticated against T3 (and therefore Metrc). */
  connected: boolean
  username?: string
  /** e.g. mo.metrc.com, or sandbox-mo.metrc.com when mode is sandbox */
  hostname?: string
  hasT3plus?: boolean
  subscriptionTier?: string | null
  subscriptionStatus?: string | null
  /** 'reports' (basic tier: report endpoints only) or 'full'. */
  apiAccessLevel?: string | null
  licenses?: T3License[]
  error?: string
}

/**
 * eligible            — active on the origin licence and allowed on a new transfer
 * active_not_eligible — on the licence but Metrc won't ship it (hold, testing, already in transit)
 * other_license       — eligible, but on a different licence the account can see
 * not_found           — not on any licence the account can see
 */
export type T3PackageState = 'eligible' | 'active_not_eligible' | 'other_license' | 'not_found'

/** What Metrc knows about one scanned tag; the picker reconciles this against Apex. */
export interface T3PackageFacts {
  tag: string
  state: T3PackageState
  /** Metrc numeric id, needed by POST /v2/transfers/create. */
  packageId?: number
  /** Licence the package was actually found on. */
  licenseNumber?: string
  itemName?: string
  productCategory?: string
  strainName?: string
  /** Package quantity in `unit` (e.g. 20 ea, or 70 g for weight-based items). */
  quantity?: number
  unit?: string
  /** Item's per-unit weight, when Metrc has one (e.g. 1 g pre-roll). */
  unitWeight?: number | null
  unitWeightUnit?: string | null
  /** Parent package labels this one was created from, as Metrc reports them. */
  sourcePackageLabels?: string[]
  productionBatchNumber?: string | null
  labTestingState?: string
  packagedDate?: string | null
  locationName?: string | null
  /** Why an active package is not eligible, when Metrc says so. */
  reason?: string
}

export interface T3VerifyRequest {
  licenseNumber: string
  tags: string[]
  /** Other origin licences in the order; misses are looked up here first. */
  otherLicenses?: string[]
}

export interface T3VerifyResponse {
  licenseNumber: string
  mode: T3Mode
  checkedAt: string
  results: T3PackageFacts[]
}

/** Mirrors DestinationHeader in src/manifest/types.ts. */
export interface T3TransferHeader {
  recipientLicense: string
  invoiceNumber: string
  /** ISO date (YYYY-MM-DD); departure 00:01, arrival 23:59 local to the licence. */
  deliveryDate: string
  /** Metrc transfer type name, e.g. "Unaffiliated Transfer". */
  transferType: string
  plannedRoute: string
  paymentTermDays?: string
}

/** Mirrors TransporterProfile in src/manifest/types.ts. */
export interface T3Transporter {
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

export interface T3TransferPackage {
  tag: string
  grossWeightG: number | null
  wholesalePrice: number | null
}

export interface T3TransferRequest {
  /** Origin licence the transfer is created under. */
  licenseNumber: string
  header: T3TransferHeader
  transporter: T3Transporter
  packages: T3TransferPackage[]
  /** false = T3 dry run with dynamic validation; nothing is written to Metrc. */
  submit: boolean
}

export interface T3ResolvedTransfer {
  recipient: { id: number; licenseNumber: string; facilityName: string }
  transporter: { id: number; licenseNumber: string; facilityName: string }
  transferType: {
    id: number
    name: string
    wholesale: boolean
    requiresDestinationGrossWeight: boolean
    requiresPackagesGrossWeight: boolean
    requiresVehicleRegistrationNumber: boolean
  }
  packageCount: number
  totalGrossG: number
  totalWholesale: number
}

export interface T3TransferResponse {
  mode: T3Mode
  submitted: boolean
  /** T3's message: "Success" or "Dry run". */
  message: string
  resolved: T3ResolvedTransfer
  /** Metrc manifest number once the outgoing transfer is visible; null if not found yet. */
  manifestNumber: string | null
  transferId: number | null
  warnings: string[]
}

/** Error body shared by every t3-* function. */
export interface T3ErrorResponse {
  error: string
  /** T3's machine-readable code when the failure came from T3/Metrc. */
  code?: string
  /** Tags involved, when the failure is about specific packages. */
  tags?: string[]
}
