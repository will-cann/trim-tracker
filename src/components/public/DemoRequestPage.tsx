import React, { useState } from 'react';
import { ArrowRight, CalendarDays, Check, Loader2 } from 'lucide-react';
import { useDocumentHead } from '../../lib/documentHead';
import { DEMO_PATH } from '../../lib/publicRouter';
import {
  buildDemoPayload,
  DEMO_FALLBACK_MAILTO,
  DEMO_FIELD_LIMITS as L,
  EMPTY_DEMO_FORM,
  FACILITY_SIZE_OPTIONS,
  OPERATION_TYPE_OPTIONS,
  submitDemoRequest,
  type DemoFormValues,
} from '../../lib/demoRequest';
import { PublicNav } from './PublicNav';
import { PublicFooter } from './PublicFooter';
import { Eyebrow } from './Eyebrow';

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors';
const labelClass = 'block text-xs font-bold tracking-wide text-gray-700 mb-1.5';

const Field: React.FC<{ id: string; label: string; optional?: boolean; children: React.ReactNode; className?: string }> = ({
  id, label, optional, children, className = '',
}) => (
  <div className={className}>
    <label htmlFor={id} className={labelClass}>
      {label}
      {optional && <span className="font-medium text-gray-400"> (optional)</span>}
    </label>
    {children}
  </div>
);

const AGENDA = [
  'Your rooms and strains on the plant map',
  'A harvest weighed by voice, start to finish',
  'Trim sessions, extraction runs and packages from the same data',
  'Questions about your workflow, compliance and setup',
];

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'done'; schedulingUrl: string | null }
  | { kind: 'error'; message: string };

export const DemoRequestPage: React.FC = () => {
  const [values, setValues] = useState<DemoFormValues>(EMPTY_DEMO_FORM);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useDocumentHead({
    title: 'Book a Demo — NeuroCann',
    description: 'See NeuroCann run on your own rooms, harvests, and crew. Thirty minutes, no slides.',
    path: DEMO_PATH,
    ogType: 'website',
  });

  const set = (key: keyof DemoFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ kind: 'submitting' });
    const payload = buildDemoPayload(values, window.location.search, document.referrer);
    const result = await submitDemoRequest(payload);
    setStatus(result.ok ? { kind: 'done', schedulingUrl: result.schedulingUrl } : { kind: 'error', message: result.error });
  };

  const submitting = status.kind === 'submitting';

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav variant="solid" />

      <main className="flex-1 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] -translate-y-1/3 translate-x-1/3 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(59,181,112,0.07) 0%, rgba(59,181,112,0) 65%)' }} />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 pt-32 pb-24 lg:pt-40 lg:pb-32 grid lg:grid-cols-[1fr_1.15fr] gap-14 lg:gap-20">
          {/* ─── Pitch ─── */}
          <div>
            <div className="text-emerald-600">
              <Eyebrow accent="bg-emerald-500" label="Book a demo" />
            </div>
            <h1 className="text-5xl sm:text-6xl font-black text-gray-900 leading-[1.02] tracking-tight mb-6">
              See it run on<br />your floor.
            </h1>
            <p className="text-lg text-gray-500 leading-relaxed mb-10 max-w-md">
              Thirty minutes with someone who has run rooms and harvests. Your facility, your workflow, no slides.
            </p>
            <ul className="space-y-4">
              {AGENDA.map((item) => (
                <li key={item} className="flex items-start gap-3 text-base text-gray-700">
                  <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* ─── Form / confirmation ─── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl shadow-gray-900/5 p-6 sm:p-8">
            {status.kind === 'done' ? (
              <div className="py-6 text-center" role="status">
                <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check className="h-6 w-6" strokeWidth={3} />
                </div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-3">Request received.</h2>
                {status.schedulingUrl ? (
                  <>
                    <p className="text-base text-gray-500 mb-8 max-w-sm mx-auto">
                      Pick a time that works now, or reply to the confirmation email we just sent.
                    </p>
                    <a
                      href={status.schedulingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-4 rounded-xl transition-all text-sm shadow-lg shadow-emerald-500/20"
                    >
                      <CalendarDays className="h-4 w-4" strokeWidth={2.5} />
                      Pick a time
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                    </a>
                  </>
                ) : (
                  <p className="text-base text-gray-500 max-w-sm mx-auto">
                    We&apos;ll email you within one business day to find a time. Check your inbox for a confirmation.
                  </p>
                )}
              </div>
            ) : (
              <form onSubmit={onSubmit} className="grid sm:grid-cols-2 gap-5">
                <Field id="demo-name" label="Name">
                  <input id="demo-name" className={inputClass} required maxLength={L.name} autoComplete="name" value={values.name} onChange={set('name')} />
                </Field>
                <Field id="demo-email" label="Work email">
                  <input id="demo-email" type="email" className={inputClass} required maxLength={L.email} autoComplete="email" value={values.email} onChange={set('email')} />
                </Field>
                <Field id="demo-company" label="Company">
                  <input id="demo-company" className={inputClass} required maxLength={L.company} autoComplete="organization" value={values.company} onChange={set('company')} />
                </Field>
                <Field id="demo-role" label="Role" optional>
                  <input id="demo-role" className={inputClass} maxLength={L.role} autoComplete="organization-title" placeholder="Head of cultivation" value={values.role} onChange={set('role')} />
                </Field>
                <Field id="demo-operation" label="Operation" optional>
                  <select id="demo-operation" className={inputClass} value={values.operationType} onChange={set('operationType')}>
                    <option value="">Select…</option>
                    {OPERATION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field id="demo-size" label="Canopy size" optional>
                  <select id="demo-size" className={inputClass} value={values.facilitySize} onChange={set('facilitySize')}>
                    <option value="">Select…</option>
                    {FACILITY_SIZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field id="demo-state" label="State" optional>
                  <input id="demo-state" className={inputClass} maxLength={L.state} autoComplete="address-level1" placeholder="CO" value={values.state} onChange={set('state')} />
                </Field>
                <Field id="demo-phone" label="Phone" optional>
                  <input id="demo-phone" type="tel" className={inputClass} maxLength={L.phone} autoComplete="tel" value={values.phone} onChange={set('phone')} />
                </Field>
                <Field id="demo-tools" label="What do you track things in today?" optional className="sm:col-span-2">
                  <input id="demo-tools" className={inputClass} maxLength={L.currentTools} placeholder="Spreadsheets, METRC, a whiteboard…" value={values.currentTools} onChange={set('currentTools')} />
                </Field>
                <Field id="demo-message" label="Anything you want to see?" optional className="sm:col-span-2">
                  <textarea id="demo-message" rows={4} className={`${inputClass} resize-y`} maxLength={L.message} value={values.message} onChange={set('message')} />
                </Field>

                {/* Honeypot: off-screen and skipped by keyboard and screen readers. */}
                <div aria-hidden="true" className="absolute -left-[10000px] top-auto w-px h-px overflow-hidden">
                  <label htmlFor="demo-website">Website</label>
                  <input id="demo-website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set('website')} />
                </div>

                <div className="sm:col-span-2" aria-live="polite">
                  {status.kind === 'error' && (
                    <p className="text-sm text-red-600 mb-4">
                      {status.message}{' '}
                      <a href={DEMO_FALLBACK_MAILTO} className="font-bold underline">Email us instead</a>.
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="group w-full inline-flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white font-bold px-8 py-4 rounded-xl transition-colors text-sm"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
                        Sending…
                      </>
                    ) : (
                      <>
                        Request a demo
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
                      </>
                    )}
                  </button>
                  <p className="text-xs text-gray-400 mt-4 text-center">
                    We use this only to set up your demo. No newsletter, no list selling.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};
