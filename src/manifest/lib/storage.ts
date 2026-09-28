import type { OrderState, TransporterProfile } from '../types'

const ORDER_KEY = 'manifest-picker:order:v1'
const TRANSPORTER_KEY = 'manifest-picker:transporter:v1'
const LICENSES_KEY = 'manifest-picker:licenses:v1'

export interface LicenseDefaults {
  cultivation: string
  manufacturing: string
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or unavailable; state stays in memory */
  }
}

export const loadOrder = () => read<OrderState>(ORDER_KEY)
export const saveOrder = (s: OrderState | null) => write(ORDER_KEY, s)

export const EMPTY_TRANSPORTER: TransporterProfile = {
  transporterLicense: '',
  phone: '',
  driverName: '',
  driverOccupationalLicense: '',
  driverLicense: '',
  vehicleMake: '',
  vehicleModel: '',
  licensePlate: '',
  registration: '',
}
export const loadTransporter = () => read<TransporterProfile>(TRANSPORTER_KEY) ?? EMPTY_TRANSPORTER
export const saveTransporter = (t: TransporterProfile) => write(TRANSPORTER_KEY, t)

export const DEFAULT_LICENSES: LicenseDefaults = { cultivation: 'CUL000030', manufacturing: 'MAN000043' }
export const loadLicenses = () => read<LicenseDefaults>(LICENSES_KEY) ?? DEFAULT_LICENSES
export const saveLicenses = (l: LicenseDefaults) => write(LICENSES_KEY, l)
