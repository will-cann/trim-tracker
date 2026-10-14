import { useSyncExternalStore } from 'react';

/**
 * Minimal pathname router for the public (unauthenticated) site.
 *
 * The authenticated app is view-state driven and never touches the URL. The
 * public marketing pages (landing, blog) need real URLs so they can be linked,
 * shared, and crawled. This keeps that concern tiny: a `pushState` wrapper plus
 * a `useSyncExternalStore` hook, with no router dependency.
 */

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

function getSnapshot() {
  return window.location.pathname;
}

function getServerSnapshot() {
  return '/';
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function navigate(path: string, { replace = false }: { replace?: boolean } = {}) {
  if (replace) {
    window.history.replaceState(null, '', path);
  } else {
    window.history.pushState(null, '', path);
  }
  notify();
  window.scrollTo({ top: 0, left: 0 });
}

export const BLOG_BASE_PATH = '/blog';
export const DEMO_PATH = '/demo';

export type PublicRoute =
  | { kind: 'blog-index' }
  | { kind: 'blog-post'; slug: string }
  | { kind: 'demo' }
  | null;

/** Resolve a pathname to a public route, or `null` if it is not a public page. */
export function matchPublicRoute(pathname: string): PublicRoute {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (normalized === DEMO_PATH) return { kind: 'demo' };
  if (normalized === BLOG_BASE_PATH) return { kind: 'blog-index' };
  if (normalized.startsWith(`${BLOG_BASE_PATH}/`)) {
    const slug = decodeURIComponent(normalized.slice(BLOG_BASE_PATH.length + 1));
    if (slug && !slug.includes('/')) return { kind: 'blog-post', slug };
  }
  return null;
}

export function blogPostPath(slug: string): string {
  return `${BLOG_BASE_PATH}/${encodeURIComponent(slug)}`;
}

/** Link to the demo request page, tagged with where the click came from. */
export function demoPath(from: string): string {
  return `${DEMO_PATH}?from=${encodeURIComponent(from)}`;
}
