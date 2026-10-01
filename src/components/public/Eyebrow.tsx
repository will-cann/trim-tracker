import React from 'react';

/* ─── Section eyebrow — short accent rule + tracked uppercase label ─── */
export const Eyebrow: React.FC<{ accent: string; label: string; align?: 'left' | 'center' }> = ({ accent, label, align = 'left' }) => (
  <div className={`flex items-center gap-3 mb-4 ${align === 'center' ? 'justify-center' : ''}`}>
    <div className={`w-10 h-0.5 ${accent} rounded-full`} />
    <p className="text-xs font-bold tracking-[0.2em] uppercase" style={{ color: 'currentColor' }}>{label}</p>
  </div>
);
