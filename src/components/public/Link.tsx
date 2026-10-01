import React from 'react';
import { navigate } from '../../lib/publicRouter';

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

function isModifiedClick(e: React.MouseEvent) {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

/**
 * Anchor that performs client-side navigation for in-app paths while leaving
 * a real `href` in the DOM for crawlers, middle-click, and copy-link.
 * External URLs, hash links, mailto:, and `target="_blank"` fall through to
 * normal browser behaviour.
 */
export const Link: React.FC<LinkProps> = ({ href, onClick, target, children, ...rest }) => {
  const isInternalPath = href.startsWith('/') && !href.startsWith('//');

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || !isInternalPath || target === '_blank' || isModifiedClick(e)) return;
    // Path + hash (e.g. "/#capabilities") should hard-navigate so the browser
    // handles the scroll-to-anchor; only pure pathnames go through pushState.
    if (href.includes('#')) return;
    e.preventDefault();
    navigate(href);
  };

  return (
    <a href={href} target={target} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
};
