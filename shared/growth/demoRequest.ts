/**
 * Wire contract for POST /v1/demo-requests on the growth server: the public
 * "Book a Demo" form sends DemoRequestPayload and gets DemoRequestResponse back.
 * The form renders these options and limits; the server validates against them.
 */

export const OPERATION_TYPE_OPTIONS = [
  { value: 'cultivation', label: 'Cultivation' },
  { value: 'extraction', label: 'Extraction / processing lab' },
  { value: 'vertical', label: 'Cultivation + extraction' },
  { value: 'processing', label: 'Processing / packaging' },
  { value: 'other', label: 'Something else' },
] as const;

export const FACILITY_SIZE_OPTIONS = [
  { value: 'under-5k', label: 'Under 5,000 sq ft canopy' },
  { value: '5k-20k', label: '5,000 – 20,000 sq ft' },
  { value: '20k-50k', label: '20,000 – 50,000 sq ft' },
  { value: '50k-plus', label: '50,000+ sq ft' },
  { value: 'not-sure', label: 'Not sure / not applicable' },
] as const;

export type OperationType = (typeof OPERATION_TYPE_OPTIONS)[number]['value'];
export type FacilitySize = (typeof FACILITY_SIZE_OPTIONS)[number]['value'];

export const OPERATION_TYPES: readonly OperationType[] = OPERATION_TYPE_OPTIONS.map((o) => o.value);
export const FACILITY_SIZES: readonly FacilitySize[] = FACILITY_SIZE_OPTIONS.map((o) => o.value);

/** Max lengths: the form's maxLength attributes and the server's truncation. */
export const DEMO_FIELD_LIMITS = {
  name: 120,
  email: 254,
  company: 160,
  role: 120,
  phone: 40,
  state: 60,
  currentTools: 300,
  message: 2000,
  source: 60,
  utm: 120,
  referrer: 500,
} as const;

/** What the form sends. Every field may be omitted; the server validates. */
export interface DemoRequestPayload {
  name?: string;
  email?: string;
  company?: string;
  role?: string;
  phone?: string;
  state?: string;
  operationType?: string;
  facilitySize?: string;
  currentTools?: string;
  message?: string;
  /** Honeypot: hidden from people, filled by bots. Non-empty means spam. */
  website?: string;
  /** Which CTA was clicked (?from= on /demo). */
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
}

export type DemoRequestResponse =
  | { ok: true; schedulingUrl: string | null }
  | { ok?: false; error: string };
