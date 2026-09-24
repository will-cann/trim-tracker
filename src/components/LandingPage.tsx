import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/authContext';
import { ActionPreview } from './ActionPreview';
import type { ProposedAction } from '../types/definitions';
import logo from '../assets/logo.png';

/* ─── Reveal ─── */
function useReveal<T extends HTMLElement>(threshold = 0.12) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

const Reveal: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({
  children,
  className = '',
  delay = 0,
}) => {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(18px)',
        transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

type DemoStep =
  | { type: 'user'; text: string }
  | { type: 'ai'; text: string }
  | { type: 'actions'; actions: ProposedAction[] }
  | { type: 'confirmed' }
  | { type: 'pause'; ms: number };

const DEMO_SCENARIOS: { label: string; prompt: string; steps: DemoStep[] }[] = [
  {
    label: 'Move plants',
    prompt: 'Move the OG Kush from veg 2 to flower 1',
    steps: [
      { type: 'user', text: 'Move the OG Kush from veg 2 to flower 1' },
      { type: 'ai', text: "I'll move all 24 plants and update their phase." },
      {
        type: 'actions',
        actions: [
          { type: 'move_plants', data: { strain: 'OG Kush', fromRoom: 'Veg Room 2', toRoom: 'Flower Room 1', plantCount: 24 } },
        ],
      },
      { type: 'pause', ms: 1800 },
      { type: 'confirmed' },
      { type: 'pause', ms: 2000 },
    ],
  },
  {
    label: 'Weigh',
    prompt: 'Plant 7 is 512 grams, has some PM',
    steps: [
      { type: 'user', text: 'Plant 7 is 512 grams, has some PM' },
      { type: 'ai', text: 'Logging the weight and flagging contamination.' },
      {
        type: 'actions',
        actions: [
          { type: 'record_plant_weight', data: { plantNumber: 7, weight: 512, harvestName: 'Wedding Cake #2' } },
          { type: 'flag_contamination', data: { plantNumber: 7, contaminationType: 'powdery_mildew', severity: 'minor' } },
        ],
      },
      { type: 'pause', ms: 1800 },
      { type: 'confirmed' },
      { type: 'pause', ms: 2000 },
    ],
  },
  {
    label: 'Extract',
    prompt: 'Start a rosin press with 2kg Wedding Cake hash',
    steps: [
      { type: 'user', text: 'Start a rosin press run with 2kg of Wedding Cake bubble hash' },
      { type: 'ai', text: 'Spinning up the run from your bubble hash inventory.' },
      {
        type: 'actions',
        actions: [
          {
            type: 'start_extraction_run',
            data: {
              strain: 'Wedding Cake',
              templateName: 'Hash to Rosin',
              inputs: [{ packageType: 'bubble_hash', quantity: 2000, unit: 'g' }],
              targetProduct: 'live_rosin',
            },
          },
        ],
      },
      { type: 'pause', ms: 1800 },
      { type: 'confirmed' },
      { type: 'pause', ms: 2000 },
    ],
  },
  {
    label: 'Order',
    prompt: 'PO for Pacific Roots — 10 cases rockwool',
    steps: [
      { type: 'user', text: 'Create a PO for Pacific Roots — 10 cases of rockwool, 5 cases of nutrients' },
      { type: 'ai', text: 'Drafting the purchase order.' },
      {
        type: 'actions',
        actions: [
          {
            type: 'create_order',
            data: {
              vendor: 'Pacific Roots Supply',
              items: '10 cs Rockwool Cubes, 5 cs Bloom Nutrients',
              status: 'draft',
            },
          },
        ],
      },
      { type: 'pause', ms: 1800 },
      { type: 'confirmed' },
      { type: 'pause', ms: 2000 },
    ],
  },
];

const NAV_ITEMS = [
  { id: 'ai', label: 'Home', active: true },
  { id: 'map', label: 'Plant map' },
  { id: 'harvest', label: 'Harvests' },
  { id: 'trim', label: 'Trim' },
  { id: 'extract', label: 'Extraction' },
  { id: 'pkg', label: 'Packages' },
  { id: 'order', label: 'Ordering' },
];

const ProductChat: React.FC<{
  scenarioIndex: number;
  onScenarioComplete: () => void;
}> = ({ scenarioIndex, onScenarioComplete }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [typingText, setTypingText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([]);
  const [pendingActions, setPendingActions] = useState<ProposedAction[] | null>(null);
  const [actionStatus, setActionStatus] = useState<'confirmed' | undefined>(undefined);
  const bodyRef = useRef<HTMLDivElement>(null);
  const runId = useRef(0);
  const onCompleteRef = useRef(onScenarioComplete);
  onCompleteRef.current = onScenarioComplete;

  const scenario = DEMO_SCENARIOS[scenarioIndex];

  useEffect(() => {
    runId.current += 1;
    setStepIndex(0);
    setMessages([]);
    setPendingActions(null);
    setActionStatus(undefined);
    setTypingText('');
    setIsTyping(false);
  }, [scenarioIndex]);

  useEffect(() => {
    const thisRun = runId.current;
    const steps = scenario.steps;

    if (stepIndex >= steps.length) {
      const t = setTimeout(() => {
        if (runId.current === thisRun) onCompleteRef.current();
      }, 400);
      return () => clearTimeout(t);
    }

    const step = steps[stepIndex];

    if (step.type === 'user' || step.type === 'ai') {
      setIsTyping(true);
      let i = 0;
      let advance: ReturnType<typeof setTimeout> | undefined;
      const speed = step.type === 'user' ? 24 : 14;
      const iv = setInterval(() => {
        if (runId.current !== thisRun) {
          clearInterval(iv);
          return;
        }
        if (i <= step.text.length) {
          setTypingText(step.text.slice(0, i));
          i++;
        } else {
          clearInterval(iv);
          setIsTyping(false);
          setMessages((prev) => [...prev, { role: step.type as 'user' | 'ai', text: step.text }]);
          setTypingText('');
          advance = setTimeout(() => {
            if (runId.current === thisRun) setStepIndex((s) => s + 1);
          }, 300);
        }
      }, speed);
      return () => {
        clearInterval(iv);
        if (advance) clearTimeout(advance);
      };
    }

    if (step.type === 'actions') {
      const t = setTimeout(() => {
        if (runId.current !== thisRun) return;
        setPendingActions(step.actions);
        setActionStatus(undefined);
        setStepIndex((s) => s + 1);
      }, 220);
      return () => clearTimeout(t);
    }

    if (step.type === 'confirmed') {
      setActionStatus('confirmed');
      const t = setTimeout(() => {
        if (runId.current === thisRun) setStepIndex((s) => s + 1);
      }, 80);
      return () => clearTimeout(t);
    }

    if (step.type === 'pause') {
      const t = setTimeout(() => {
        if (runId.current === thisRun) setStepIndex((s) => s + 1);
      }, step.ms);
      return () => clearTimeout(t);
    }
  }, [stepIndex, scenario]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, typingText, pendingActions, actionStatus]);

  const current = stepIndex < scenario.steps.length ? scenario.steps[stepIndex] : null;
  const typingRole =
    current && (current.type === 'user' || current.type === 'ai') ? current.type : null;

  return (
    <div className="fig-chat">
      <div ref={bodyRef} className="fig-chat-body">
        {messages.length === 0 && !typingText && (
          <div className="fig-chat-empty">
            <img src={logo} alt="" className="fig-chat-empty-logo" />
            <p>Ask anything about the facility</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`fig-msg ${m.role === 'user' ? 'is-user' : 'is-ai'}`}>
            {m.text}
          </div>
        ))}
        {typingRole && typingText && (
          <div className={`fig-msg ${typingRole === 'user' ? 'is-user' : 'is-ai'}`}>
            {typingText}
            {isTyping && <span className="fig-caret" />}
          </div>
        )}
        {pendingActions && (
          <div className="fig-actions">
            <ActionPreview
              actions={pendingActions}
              readonly={actionStatus === 'confirmed'}
              status={actionStatus}
              {...(!actionStatus && { onConfirm: () => {}, onCancel: () => {} })}
            />
          </div>
        )}
      </div>
      <div className="fig-composer">
        <span className="fig-composer-placeholder">Talk or type a command…</span>
        <button type="button" className="fig-mic" aria-label="Voice" tabIndex={-1}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

/** Full product shell — the Figma-style hero visual */
const ProductShell: React.FC<{
  scenarioIndex: number;
  onScenarioComplete: () => void;
}> = ({ scenarioIndex, onScenarioComplete }) => (
  <div className="fig-shell" id="product">
    <aside className="fig-sidebar" aria-hidden>
      <div className="fig-sidebar-brand">
        <img src={logo} alt="" />
        <span>neurocann</span>
      </div>
      <nav className="fig-sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <div key={item.id} className={`fig-nav-item ${item.active ? 'is-active' : ''}`}>
            {item.label}
          </div>
        ))}
      </nav>
      <div className="fig-sidebar-foot">
        <div className="fig-avatar">W</div>
        <span>Will · Admin</span>
      </div>
    </aside>
    <main className="fig-main">
      <header className="fig-main-bar">
        <span className="fig-main-title">Home</span>
        <span className="fig-pill">
          <i /> Ambient on
        </span>
      </header>
      <ProductChat scenarioIndex={scenarioIndex} onScenarioComplete={onScenarioComplete} />
    </main>
  </div>
);

const FEATURES = [
  {
    title: 'Speak. Confirm. Done.',
    body: 'Natural language becomes structured actions — plant moves, weights, packages, POs — with a preview before anything writes.',
  },
  {
    title: 'Every module. One home.',
    body: 'Cultivation, harvest, trim, extraction, packaging, ordering. The same conversation covers the floor.',
  },
  {
    title: 'Ambient when your hands are full.',
    body: 'Background listening queues actions while you work. Review when you’re ready — not when a screen demands it.',
  },
];

export const LandingPage: React.FC = () => {
  const { login } = useAuth();
  const [solid, setSolid] = useState(false);
  const [scenarioIndex, setScenarioIndex] = useState(0);

  useEffect(() => {
    let on = false;
    const onScroll = () => {
      const next = window.scrollY > 12;
      if (next !== on) {
        on = next;
        setSolid(next);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const advance = () => setScenarioIndex((s) => (s + 1) % DEMO_SCENARIOS.length);

  return (
    <div className="fig">
      <nav className={`fig-top ${solid ? 'is-solid' : ''}`}>
        <div className="fig-top-inner">
          <a
            href="#"
            className="fig-logo"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <img src={logo} alt="" />
            neurocann
          </a>
          <div className="fig-top-actions">
            <a href="#product" className="fig-link">
              Product
            </a>
            <button type="button" className="fig-link-btn" onClick={() => login()}>
              Sign in
            </button>
            <a
              href="mailto:will@neurocann.app?subject=NeuroCann%20Demo%20Request"
              className="fig-cta"
            >
              Book demo
            </a>
          </div>
        </div>
      </nav>

      {/* Hero: brand + copy, then full-bleed product UI */}
      <header className="fig-hero">
        <div className="fig-hero-copy">
          <p className="fig-brand">neurocann</p>
          <h1>Facility operations, in one conversation.</h1>
          <p className="fig-lede">
            The ops console for cultivation through compliance. Voice-first. Confirm before it writes.
          </p>
          <div className="fig-hero-cta">
            <a
              href="mailto:will@neurocann.app?subject=NeuroCann%20Demo%20Request"
              className="fig-cta fig-cta-lg"
            >
              Book a demo
            </a>
            <a href="#product" className="fig-ghost">
              See the product
            </a>
          </div>
        </div>

        <div className="fig-hero-ui">
          <ProductShell scenarioIndex={scenarioIndex} onScenarioComplete={advance} />
        </div>

        <div className="fig-prompts" aria-label="Try a prompt">
          {DEMO_SCENARIOS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              className={`fig-prompt ${i === scenarioIndex ? 'is-active' : ''}`}
              onClick={() => setScenarioIndex(i)}
            >
              {s.prompt}
            </button>
          ))}
        </div>
      </header>

      <section className="fig-features">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={i * 80}>
            <article>
              <h2>{f.title}</h2>
              <p>{f.body}</p>
            </article>
          </Reveal>
        ))}
      </section>

      <section className="fig-close">
        <Reveal>
          <h2>Built for the floor. Quiet enough for the office.</h2>
          <p>Book fifteen minutes. We’ll walk your next harvest through NeuroCann.</p>
          <div className="fig-hero-cta is-center">
            <a
              href="mailto:will@neurocann.app?subject=NeuroCann%20Demo%20Request"
              className="fig-cta fig-cta-lg"
            >
              Book a demo
            </a>
            <button type="button" className="fig-ghost" onClick={() => login()}>
              Sign in
            </button>
          </div>
        </Reveal>
      </section>

      <footer className="fig-foot">
        <span className="fig-logo is-muted">
          <img src={logo} alt="" />
          neurocann
        </span>
        <span>© {new Date().getFullYear()} NeuroCann</span>
      </footer>

      <style>{`
        .fig {
          --panther: #1a1a1a;
          --rhino: #959595;
          --dolphin: #c0c0c0;
          --koala: #f1f1f1;
          --white: #ffffff;
          --chameleon: #3bb570;
          --chameleon-ink: #1f7a48;
          --canvas: #f7f7f5;
          --line: rgba(26, 26, 26, 0.08);
          --font: 'Lato', system-ui, sans-serif;
          min-height: 100vh;
          background: var(--canvas);
          color: var(--panther);
          font-family: var(--font);
          overflow-x: hidden;
        }

        /* Top nav — Figma-thin */
        .fig-top {
          position: fixed;
          inset: 0 0 auto 0;
          z-index: 50;
          transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
          border-bottom: 1px solid transparent;
        }
        .fig-top.is-solid {
          background: rgba(247, 247, 245, 0.92);
          backdrop-filter: blur(12px);
          border-bottom-color: var(--line);
        }
        .fig-top-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1.5rem;
          height: 3.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .fig-logo {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          text-decoration: none;
          color: var(--panther);
          font-weight: 900;
          font-size: 0.95rem;
          letter-spacing: -0.02em;
        }
        .fig-logo img {
          width: 1.35rem;
          height: 1.35rem;
          object-fit: contain;
        }
        .fig-logo.is-muted {
          color: var(--rhino);
          font-size: 0.85rem;
        }
        .fig-top-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .fig-link,
        .fig-link-btn {
          display: none;
          background: none;
          border: none;
          font: inherit;
          font-size: 0.875rem;
          font-weight: 700;
          color: var(--rhino);
          text-decoration: none;
          cursor: pointer;
          padding: 0;
        }
        .fig-link:hover,
        .fig-link-btn:hover { color: var(--panther); }
        @media (min-width: 640px) {
          .fig-link, .fig-link-btn { display: inline; }
        }
        .fig-cta {
          background: var(--panther);
          color: var(--white);
          text-decoration: none;
          font-size: 0.8125rem;
          font-weight: 700;
          padding: 0.5rem 0.9rem;
          border-radius: 0.5rem;
          transition: background 0.15s;
        }
        .fig-cta:hover { background: #000; }
        .fig-cta-lg {
          padding: 0.85rem 1.25rem;
          font-size: 0.9rem;
          background: var(--chameleon);
          color: #062012;
        }
        .fig-cta-lg:hover { background: #34c873; }

        /* Hero */
        .fig-hero {
          padding: 5.5rem 1.5rem 3rem;
          max-width: 1200px;
          margin: 0 auto;
        }
        .fig-hero-copy {
          max-width: 36rem;
          margin: 0 auto 2.5rem;
          text-align: center;
          opacity: 0;
          animation: figIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.05s forwards;
        }
        .fig-brand {
          margin: 0 0 0.75rem;
          font-size: clamp(2.5rem, 7vw, 4rem);
          font-weight: 900;
          letter-spacing: -0.045em;
          line-height: 1;
          color: var(--panther);
        }
        .fig-hero h1 {
          margin: 0 0 0.85rem;
          font-size: clamp(1.35rem, 3.2vw, 1.85rem);
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.25;
          color: var(--panther);
        }
        .fig-lede {
          margin: 0 auto 1.5rem;
          max-width: 28rem;
          font-size: 1.05rem;
          line-height: 1.5;
          color: var(--rhino);
          font-weight: 400;
        }
        .fig-hero-cta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.65rem;
          justify-content: center;
        }
        .fig-hero-cta.is-center { justify-content: center; }
        .fig-ghost {
          display: inline-flex;
          align-items: center;
          background: var(--white);
          color: var(--panther);
          text-decoration: none;
          font: inherit;
          font-size: 0.9rem;
          font-weight: 700;
          padding: 0.8rem 1.2rem;
          border-radius: 0.5rem;
          border: 1px solid var(--dolphin);
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .fig-ghost:hover { border-color: var(--panther); }

        /* Product UI plane — dominant */
        .fig-hero-ui {
          opacity: 0;
          animation: figIn 0.8s cubic-bezier(0.16,1,0.3,1) 0.15s forwards;
        }
        .fig-shell {
          display: grid;
          grid-template-columns: 12.5rem 1fr;
          background: var(--white);
          border: 1px solid var(--line);
          border-radius: 0.75rem;
          overflow: hidden;
          height: min(62vh, 520px);
          min-height: 420px;
          box-shadow:
            0 1px 2px rgba(26, 26, 26, 0.04),
            0 24px 48px rgba(26, 26, 26, 0.08);
        }
        @media (max-width: 720px) {
          .fig-shell { grid-template-columns: 1fr; }
          .fig-sidebar { display: none; }
        }
        .fig-sidebar {
          background: var(--koala);
          border-right: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          padding: 1rem 0.75rem;
        }
        .fig-sidebar-brand {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.35rem 0.5rem 1.1rem;
          font-weight: 900;
          font-size: 0.85rem;
          letter-spacing: -0.02em;
        }
        .fig-sidebar-brand img {
          width: 1.15rem;
          height: 1.15rem;
        }
        .fig-sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .fig-nav-item {
          padding: 0.45rem 0.6rem;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--rhino);
          border-radius: 0.4rem;
        }
        .fig-nav-item.is-active {
          background: var(--white);
          color: var(--panther);
          box-shadow: 0 1px 2px rgba(26, 26, 26, 0.06);
        }
        .fig-sidebar-foot {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 0.5rem 0.25rem;
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--rhino);
          border-top: 1px solid var(--line);
          margin-top: 0.75rem;
        }
        .fig-avatar {
          width: 1.5rem;
          height: 1.5rem;
          border-radius: 50%;
          background: var(--chameleon);
          color: #062012;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.65rem;
          font-weight: 900;
        }
        .fig-main {
          display: flex;
          flex-direction: column;
          min-width: 0;
          background: var(--white);
        }
        .fig-main-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.85rem 1.25rem;
          border-bottom: 1px solid var(--line);
        }
        .fig-main-title {
          font-weight: 900;
          font-size: 0.95rem;
          letter-spacing: -0.02em;
        }
        .fig-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.7rem;
          font-weight: 700;
          color: var(--chameleon-ink);
          background: rgba(59, 181, 112, 0.12);
          padding: 0.3rem 0.55rem;
          border-radius: 0.35rem;
        }
        .fig-pill i {
          width: 0.4rem;
          height: 0.4rem;
          border-radius: 50%;
          background: var(--chameleon);
          display: block;
          animation: figPulse 2s ease-out infinite;
        }

        .fig-chat {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .fig-chat-body {
          flex: 1;
          overflow-y: auto;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          max-height: 380px;
        }
        .fig-chat-empty {
          margin: auto;
          text-align: center;
          color: var(--rhino);
          font-size: 0.9rem;
          font-weight: 400;
        }
        .fig-chat-empty-logo {
          width: 2rem;
          height: 2rem;
          opacity: 0.35;
          margin: 0 auto 0.75rem;
          display: block;
        }
        .fig-msg {
          max-width: 85%;
          padding: 0.7rem 0.95rem;
          font-size: 0.875rem;
          line-height: 1.45;
          border-radius: 1rem;
          font-weight: 400;
        }
        .fig-msg.is-user {
          align-self: flex-end;
          background: var(--panther);
          color: var(--white);
          border-bottom-right-radius: 0.25rem;
        }
        .fig-msg.is-ai {
          align-self: flex-start;
          background: var(--koala);
          color: var(--panther);
          border-bottom-left-radius: 0.25rem;
        }
        .fig-caret {
          display: inline-block;
          width: 2px;
          height: 0.95em;
          background: currentColor;
          margin-left: 2px;
          vertical-align: -0.1em;
          animation: figBlink 1s step-end infinite;
        }
        .fig-actions { padding-top: 0.25rem; }
        .fig-composer {
          margin: 0 1rem 1rem;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.85rem 1rem;
          background: var(--koala);
          border-radius: 0.75rem;
        }
        .fig-composer-placeholder {
          flex: 1;
          font-size: 0.875rem;
          color: var(--dolphin);
          font-weight: 400;
        }
        .fig-mic {
          background: none;
          border: none;
          color: var(--chameleon);
          padding: 0;
          display: flex;
          cursor: default;
        }

        .fig-prompts {
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
          padding: 1.25rem 0 0;
          scrollbar-width: none;
        }
        .fig-prompts::-webkit-scrollbar { display: none; }
        .fig-prompt {
          flex: 0 0 auto;
          background: var(--white);
          border: 1px solid var(--line);
          color: var(--rhino);
          font: inherit;
          font-size: 0.8rem;
          font-weight: 700;
          padding: 0.55rem 0.85rem;
          border-radius: 0.45rem;
          cursor: pointer;
          max-width: 18rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: border-color 0.15s, color 0.15s;
        }
        .fig-prompt:hover {
          border-color: var(--dolphin);
          color: var(--panther);
        }
        .fig-prompt.is-active {
          border-color: var(--chameleon);
          color: var(--chameleon-ink);
          background: rgba(59, 181, 112, 0.08);
        }

        /* Features — one job each, no cards */
        .fig-features {
          max-width: 1200px;
          margin: 0 auto;
          padding: 4.5rem 1.5rem;
          display: grid;
          gap: 2.5rem;
          border-top: 1px solid var(--line);
        }
        @media (min-width: 800px) {
          .fig-features {
            grid-template-columns: repeat(3, 1fr);
            gap: 2rem;
          }
        }
        .fig-features h2 {
          margin: 0 0 0.5rem;
          font-size: 1.15rem;
          font-weight: 900;
          letter-spacing: -0.025em;
        }
        .fig-features p {
          margin: 0;
          color: var(--rhino);
          font-size: 0.95rem;
          line-height: 1.5;
          font-weight: 400;
        }

        .fig-close {
          max-width: 36rem;
          margin: 0 auto;
          padding: 3rem 1.5rem 5rem;
          text-align: center;
        }
        .fig-close h2 {
          margin: 0 0 0.65rem;
          font-size: clamp(1.5rem, 3.5vw, 2rem);
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.2;
        }
        .fig-close p {
          margin: 0 0 1.5rem;
          color: var(--rhino);
          font-size: 1.05rem;
          line-height: 1.5;
        }

        .fig-foot {
          border-top: 1px solid var(--line);
          max-width: 1200px;
          margin: 0 auto;
          padding: 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          color: var(--rhino);
          font-size: 0.8rem;
          font-weight: 400;
        }

        @keyframes figIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes figBlink {
          50% { opacity: 0; }
        }
        @keyframes figPulse {
          0% { box-shadow: 0 0 0 0 rgba(59, 181, 112, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(59, 181, 112, 0); }
          100% { box-shadow: 0 0 0 0 rgba(59, 181, 112, 0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .fig-hero-copy,
          .fig-hero-ui,
          .fig-pill i,
          .fig-caret {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
