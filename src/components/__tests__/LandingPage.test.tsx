/**
 * Public landing page — hero visibility, demo explainer and METRC framing.
 *
 * Run with:
 *     npx vitest run src/components/__tests__/LandingPage.test.tsx
 */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';

vi.mock('../../contexts/authContext', () => ({
  useAuth: () => ({ user: null, loading: false, login: vi.fn(), logout: vi.fn(), getToken: async () => null }),
}));

import { LandingPage } from '../LandingPage';

beforeAll(() => {
  // jsdom has no IntersectionObserver; Reveal renders visible when it is missing.
  vi.stubGlobal('IntersectionObserver', undefined);
});

afterEach(() => cleanup());

describe('LandingPage hero', () => {
  it('renders the headline and CTAs without a hidden starting opacity', () => {
    render(<LandingPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toMatch(/Run your facility/);
    expect(h1.getAttribute('style')).toBeNull();

    const cta = screen.getAllByRole('link', { name: /Book a Demo/ })[0];
    expect(cta.closest('div')?.getAttribute('style')).toBeNull();
    expect(cta.getAttribute('href')).toContain('/demo');
  });

  it('explains what booking a demo involves next to both CTAs', () => {
    render(<LandingPage />);
    const explainers = screen.getAllByText(/thirty-minute call/i);
    expect(explainers).toHaveLength(2);
    for (const el of explainers) {
      expect(el.textContent).toMatch(/no slides/);
      expect(el.textContent).toMatch(/within a business day/);
    }
  });
});

describe('LandingPage METRC section', () => {
  it('presents METRC as available via T3 with synced and reviewed columns', () => {
    render(<LandingPage />);
    const heading = screen.getByRole('heading', { name: /Connected to METRC/ });
    const section = heading.closest('section')!;
    expect(section.id).toBe('metrc');
    expect(section.textContent).toMatch(/Track & Trace Tools \(T3\)/);
    expect(section.textContent).toMatch(/every 15 minutes/);

    const synced = within(section).getByRole('heading', { name: /Synced today/ }).closest('div')!.parentElement!;
    expect(synced.textContent).toMatch(/Packages/);
    expect(synced.textContent).toMatch(/Plants and plant batches/);
    expect(synced.textContent).toMatch(/Harvests/);

    const reviewed = within(section).getByRole('heading', { name: /You still review/ }).closest('div')!.parentElement!;
    expect(reviewed.textContent).toMatch(/Every write is proposed first/);
    expect(reviewed.textContent).toMatch(/Transfers are verified case by case/);
  });

  it('no longer lists METRC sync as a roadmap-only item', () => {
    render(<LandingPage />);
    expect(screen.queryByText('METRC API sync')).toBeNull();
    const writeBack = screen.getByText('METRC write-back');
    expect(writeBack.parentElement?.textContent).toMatch(/Soon/);
  });
});
