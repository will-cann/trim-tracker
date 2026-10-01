import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/authContext';
import { NeurocannLogo } from './NeurocannLogo';
import { Link } from './Link';
import { BLOG_BASE_PATH } from '../../lib/publicRouter';

export const DEMO_MAILTO = 'mailto:will@neurocann.app?subject=NeuroCann%20Demo%20Request';

interface PublicNavProps {
  /**
   * `transparent` fades in a white background on scroll (landing hero).
   * `solid` is always opaque (content pages like the blog).
   */
  variant?: 'transparent' | 'solid';
  /** Which nav item to highlight as current. */
  active?: 'blog';
}

export const PublicNav: React.FC<PublicNavProps> = ({ variant = 'transparent', active }) => {
  const { user, login } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (variant !== 'transparent') return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [variant]);

  const opaque = variant === 'solid' || scrolled;
  const linkClass = (isActive: boolean) =>
    `hidden sm:block text-sm font-medium transition-colors ${isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-900'}`;

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        opaque ? 'bg-white/95 backdrop-blur-sm border-b border-gray-100' : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 lg:px-8 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2.5" aria-label="NeuroCann home">
          <NeurocannLogo className="w-7 h-7" stroke="#3BB570" />
          <span className="text-base font-black text-gray-900 tracking-tight">
            neuro<span className="text-gray-400">cann</span>
          </span>
        </Link>
        <div className="flex items-center gap-8">
          <Link href="/#capabilities" className={linkClass(false)}>
            Platform
          </Link>
          <Link href="/#how-it-works" className={linkClass(false)}>
            How It Works
          </Link>
          <Link href={BLOG_BASE_PATH} className={linkClass(active === 'blog')} aria-current={active === 'blog' ? 'page' : undefined}>
            Blog
          </Link>
          {user ? (
            <Link href="/" className="text-sm font-bold text-gray-900 hover:text-emerald-600 transition-colors">
              Open App
            </Link>
          ) : (
            <button
              onClick={() => login()}
              className="text-sm font-bold text-gray-900 hover:text-emerald-600 transition-colors"
            >
              Sign In
            </button>
          )}
          <a
            href={DEMO_MAILTO}
            className="bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors"
          >
            Book Demo
          </a>
        </div>
      </div>
    </nav>
  );
};
