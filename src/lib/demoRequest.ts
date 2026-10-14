import type { DemoRequestPayload, DemoRequestResponse } from '../../shared/growth/demoRequest';

/**
 * Client side of the public "Book a Demo" form. Posts to the growth server
 * (growth/ in this repo) through the same-origin proxy at /api/growth/*
 * (netlify.toml in prod, vite.config.ts in dev). The wire contract, options
 * and field limits live in shared/growth/demoRequest.ts.
 */

export {
  DEMO_FIELD_LIMITS,
  FACILITY_SIZE_OPTIONS,
  OPERATION_TYPE_OPTIONS,
} from '../../shared/growth/demoRequest';

export const DEMO_REQUEST_ENDPOINT = '/api/growth/v1/demo-requests';
export const DEMO_FALLBACK_MAILTO = 'mailto:will@neurocann.app?subject=NeuroCann%20Demo%20Request';

/** Everything the visitor types (attribution is added at submit time). */
export type DemoFormValues = Required<
  Omit<DemoRequestPayload, 'source' | 'utmSource' | 'utmMedium' | 'utmCampaign' | 'referrer'>
>;

export const EMPTY_DEMO_FORM: DemoFormValues = {
  name: '', email: '', company: '', role: '', phone: '', state: '',
  operationType: '', facilitySize: '', currentTools: '', message: '', website: '',
};

/** Form values + attribution (?from= and utm_* on the page URL, and the referrer). */
export function buildDemoPayload(values: DemoFormValues, search: string, referrer: string): DemoRequestPayload {
  const params = new URLSearchParams(search);
  const blankToUndefined = (v: string | null) => (v && v.trim() ? v.trim() : undefined);
  return {
    ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, blankToUndefined(v)])),
    source: blankToUndefined(params.get('from')),
    utmSource: blankToUndefined(params.get('utm_source')),
    utmMedium: blankToUndefined(params.get('utm_medium')),
    utmCampaign: blankToUndefined(params.get('utm_campaign')),
    referrer: blankToUndefined(referrer),
  };
}

export type DemoSubmitResult =
  | { ok: true; schedulingUrl: string | null }
  | { ok: false; error: string };

export async function submitDemoRequest(
  payload: DemoRequestPayload,
  fetchFn: typeof fetch = fetch,
): Promise<DemoSubmitResult> {
  try {
    const res = await fetchFn(DEMO_REQUEST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null) as DemoRequestResponse | null;
    if (res.ok && json?.ok) return { ok: true, schedulingUrl: json.schedulingUrl ?? null };
    return { ok: false, error: (json && 'error' in json && json.error) || 'Something went wrong sending your request.' };
  } catch {
    return { ok: false, error: 'Could not reach our server.' };
  }
}
