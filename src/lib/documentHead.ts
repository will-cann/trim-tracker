import { useEffect } from 'react';

/**
 * Per-page `<head>` management for the public site.
 *
 * `index.html` ships the defaults for the landing page. Blog pages override
 * title / description / canonical / Open Graph while mounted and restore the
 * originals on unmount so navigating back to the landing page is clean.
 */

export interface DocumentHeadOptions {
  title: string;
  description?: string;
  /** Absolute or path-only canonical URL. Paths are resolved against the origin. */
  path?: string;
  ogType?: 'website' | 'article';
}

const SITE_ORIGIN = 'https://neurocann.app';

function setMeta(selector: string, attr: 'content' | 'href', value: string | undefined): () => void {
  const el = document.head.querySelector<HTMLMetaElement | HTMLLinkElement>(selector);
  if (!el || value === undefined) return () => {};
  const previous = el.getAttribute(attr);
  el.setAttribute(attr, value);
  return () => {
    if (previous === null) el.removeAttribute(attr);
    else el.setAttribute(attr, previous);
  };
}

export function useDocumentHead({ title, description, path, ogType }: DocumentHeadOptions) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    const url = path ? `${SITE_ORIGIN}${path}` : undefined;
    const restorers = [
      setMeta('meta[name="description"]', 'content', description),
      setMeta('link[rel="canonical"]', 'href', url),
      setMeta('meta[property="og:title"]', 'content', title),
      setMeta('meta[property="og:description"]', 'content', description),
      setMeta('meta[property="og:url"]', 'content', url),
      setMeta('meta[property="og:type"]', 'content', ogType),
      setMeta('meta[name="twitter:title"]', 'content', title),
      setMeta('meta[name="twitter:description"]', 'content', description),
    ];

    return () => {
      document.title = previousTitle;
      restorers.forEach((restore) => restore());
    };
  }, [title, description, path, ogType]);
}
