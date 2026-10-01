import React, { useEffect, useRef, useState } from 'react';

const supportsIntersectionObserver = () => typeof IntersectionObserver !== 'undefined';

/* ─── Scroll-reveal hook ─── */
function useReveal<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  // Without IntersectionObserver (old browsers, test environments) content is
  // shown immediately rather than staying hidden forever.
  const [visible, setVisible] = useState(() => !supportsIntersectionObserver());
  useEffect(() => {
    const el = ref.current;
    if (!el || !supportsIntersectionObserver()) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ─── Reveal wrapper ─── */
export const Reveal: React.FC<{
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'left' | 'right';
}> = ({ children, className = '', delay = 0, direction = 'up' }) => {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const transforms = { up: 'translateY(40px)', left: 'translateX(-40px)', right: 'translateX(40px)' };
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : transforms[direction],
        transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};
