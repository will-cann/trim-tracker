import React from 'react';
import { NeurocannLogo } from './NeurocannLogo';
import { Link } from './Link';
import { BLOG_BASE_PATH } from '../../lib/publicRouter';

export const PublicFooter: React.FC = () => (
  <footer className="bg-gray-950 border-t border-gray-800 py-10 px-6 lg:px-8">
    <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
      <Link href="/" className="flex items-center gap-2.5" aria-label="NeuroCann home">
        <NeurocannLogo className="w-5 h-5" stroke="#4B5563" />
        <span className="text-sm font-bold text-gray-600 tracking-tight">
          neuro<span className="text-gray-700">cann</span>
        </span>
      </Link>
      <div className="flex items-center gap-6">
        <Link href="/#capabilities" className="text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors">Platform</Link>
        <Link href={BLOG_BASE_PATH} className="text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors">Blog</Link>
        <a href="mailto:will@neurocann.app" className="text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors">Contact</a>
      </div>
      <p className="text-xs text-gray-600">
        &copy; {new Date().getFullYear()} NeuroCann. All rights reserved.
      </p>
    </div>
  </footer>
);
