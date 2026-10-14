/**
 * Public "Book a Demo" page and its submit helper.
 *
 * Run with:
 *     npx vitest run src/components/__tests__/DemoRequestPage.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../contexts/authContext', () => ({
  useAuth: () => ({ user: null, loading: false, login: vi.fn(), logout: vi.fn(), getToken: async () => null }),
}));

import { DemoRequestPage } from '../public/DemoRequestPage';
import { buildDemoPayload, EMPTY_DEMO_FORM, submitDemoRequest, DEMO_REQUEST_ENDPOINT } from '../../lib/demoRequest';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('buildDemoPayload', () => {
  it('trims values, drops blanks, and adds attribution from the URL', () => {
    const payload = buildDemoPayload(
      { ...EMPTY_DEMO_FORM, name: ' Jane ', email: 'j@acme.com', company: 'Acme', role: '  ' },
      '?from=hero&utm_source=google&utm_campaign=fall',
      'https://www.google.com/',
    );
    expect(payload).toMatchObject({
      name: 'Jane', email: 'j@acme.com', company: 'Acme', role: undefined, website: undefined,
      source: 'hero', utmSource: 'google', utmMedium: undefined, utmCampaign: 'fall', referrer: 'https://www.google.com/',
    });
  });
});

describe('submitDemoRequest', () => {
  it('returns the scheduling link on success', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ ok: true, schedulingUrl: 'https://cal.com/x' }), { status: 200 }));
    expect(await submitDemoRequest({} as never, fetchFn as unknown as typeof fetch)).toEqual({ ok: true, schedulingUrl: 'https://cal.com/x' });
    expect(fetchFn).toHaveBeenCalledWith(DEMO_REQUEST_ENDPOINT, expect.objectContaining({ method: 'POST' }));
  });

  it('surfaces server errors and network failures', async () => {
    const bad = vi.fn(async () => new Response(JSON.stringify({ error: 'Please add your name.' }), { status: 400 }));
    expect(await submitDemoRequest({} as never, bad as unknown as typeof fetch)).toEqual({ ok: false, error: 'Please add your name.' });
    const down = vi.fn(async () => { throw new TypeError('fetch failed'); });
    expect(await submitDemoRequest({} as never, down as unknown as typeof fetch)).toEqual({ ok: false, error: 'Could not reach our server.' });
  });
});

describe('DemoRequestPage', () => {
  function fillRequired() {
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jane Grower' } });
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'jane@acmefarms.com' } });
    fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme Farms' } });
  }

  it('sets the document title', () => {
    render(<DemoRequestPage />);
    expect(document.title).toBe('Book a Demo — NeuroCann');
  });

  it('submits the form with attribution and shows the scheduling link', async () => {
    window.history.replaceState(null, '', '/demo?from=hero');
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ ok: true, schedulingUrl: 'https://cal.com/neurocann/demo?name=Jane' })));
    vi.stubGlobal('fetch', fetchFn);

    render(<DemoRequestPage />);
    fillRequired();
    fireEvent.change(screen.getByLabelText(/Operation/), { target: { value: 'vertical' } });
    fireEvent.click(screen.getByRole('button', { name: /Request a demo/ }));

    const link = await screen.findByRole('link', { name: /Pick a time/ });
    expect(link.getAttribute('href')).toBe('https://cal.com/neurocann/demo?name=Jane');
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ name: 'Jane Grower', email: 'jane@acmefarms.com', company: 'Acme Farms', operationType: 'vertical', source: 'hero' });
  });

  it('confirms without a scheduling link when none is configured', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, schedulingUrl: null }))));
    render(<DemoRequestPage />);
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /Request a demo/ }));
    expect(await screen.findByText(/within one business day/)).toBeTruthy();
  });

  it('shows the error with an email fallback when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Too many requests. Please email us instead.' }), { status: 429 })));
    render(<DemoRequestPage />);
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /Request a demo/ }));
    await waitFor(() => expect(screen.getByText(/Too many requests/)).toBeTruthy());
    expect(screen.getByRole('link', { name: 'Email us instead' }).getAttribute('href')).toMatch(/^mailto:will@neurocann\.app/);
  });
});
