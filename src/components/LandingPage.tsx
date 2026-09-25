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
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const show = reduceMotion || visible;
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: show ? 1 : 0,
        transform: show ? 'none' : 'translateY(18px)',
        transition: reduceMotion
          ? 'none'
          : `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
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
    label: 'Assign floor work',
    prompt: 'Assign Maya to move OG Kush from veg 2 to flower 1',
    steps: [
      { type: 'user', text: 'Assign Maya to move the OG Kush from veg 2 to flower 1' },
      { type: 'ai', text: 'Creating a floor task. When Maya marks it done, I’ll update the plant map and compliance trail.' },
      {
        type: 'actions',
        actions: [
          {
            type: 'create_human_task',
            data: {
              title: 'Move OG Kush · veg 2 → flower 1',
              assignee: 'Maya',
              priority: 'high',
              category: 'cultivation',
              onCompleteAction: { type: 'move_plants', data: { strain: 'OG Kush', fromRoom: 'Veg Room 2', toRoom: 'Flower Room 1', plantCount: 24 } },
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
    label: 'Meeting → tasks',
    prompt: 'From standup: check dry room RH, restock rockwool, pull lab results',
    steps: [
      { type: 'user', text: 'From standup — assign Jordan dry room RH check, Sam restock rockwool, Alisha pull pending lab results' },
      { type: 'ai', text: 'Turning the meeting into three assigned actions.' },
      {
        type: 'actions',
        actions: [
          { type: 'create_human_task', data: { title: 'Check dry room RH', assignee: 'Jordan', priority: 'high', category: 'environmental' } },
          { type: 'create_human_task', data: { title: 'Restock rockwool', assignee: 'Sam', priority: 'medium', category: 'supplies' } },
          { type: 'create_human_task', data: { title: 'Pull pending lab results', assignee: 'Alisha', priority: 'medium', category: 'compliance' } },
        ],
      },
      { type: 'pause', ms: 1800 },
      { type: 'confirmed' },
      { type: 'pause', ms: 2000 },
    ],
  },
  {
    label: 'Weigh on floor',
    prompt: 'Plant 7 is 512 grams, has some PM',
    steps: [
      { type: 'user', text: 'Plant 7 is 512 grams, has some PM' },
      { type: 'ai', text: 'Logging weight and flagging contamination for the harvest record.' },
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
    label: 'Visibility',
    prompt: 'What’s the state of flower rooms and open packages?',
    steps: [
      { type: 'user', text: 'What’s the state of flower rooms and open packages?' },
      { type: 'ai', text: 'Flower 1 · Wedding Cake · 48 plants · healthy. Flower 2 · OG Kush · 36 · watch list. 186 active packages · 16 lab pending.' },
      { type: 'pause', ms: 2800 },
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
      <div ref={bodyRef} className="fig-chat-body" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 && !typingText && (
          <div className="fig-chat-empty">
            <img src={logo} alt="" className="fig-chat-empty-logo" />
            <p>Ask anything about the facility</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`fig-msg ${m.role === 'user' ? 'is-user' : 'is-ai'}`}>
            {m.role === 'user' ? (
              <span className="fig-sr-only">You said: </span>
            ) : (
              <span className="fig-sr-only">NeuroCann: </span>
            )}
            {m.text}
          </div>
        ))}
        {typingRole && typingText && (
          <div className={`fig-msg ${typingRole === 'user' ? 'is-user' : 'is-ai'}`} aria-hidden="true">
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
      <div className="fig-composer" aria-hidden="true">
        <span className="fig-composer-placeholder">Talk or type a command…</span>
        <span className="fig-mic" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        </span>
      </div>
    </div>
  );
};

/** Full product shell — the Figma-style hero visual */
const ProductShell: React.FC<{
  scenarioIndex: number;
  onScenarioComplete: () => void;
}> = ({ scenarioIndex, onScenarioComplete }) => (
  <div
    className="fig-shell"
    id="product"
    role="region"
    aria-label="Interactive product preview"
  >
    <aside className="fig-sidebar" aria-hidden="true">
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
    <div className="fig-main">
      <div className="fig-main-bar">
        <span className="fig-main-title">Home</span>
        <span className="fig-pill">
          <i aria-hidden="true" /> Ambient on
        </span>
      </div>
      <ProductChat scenarioIndex={scenarioIndex} onScenarioComplete={onScenarioComplete} />
    </div>
  </div>
);

const FRAGMENTS = [
  'METRC portal',
  'Spreadsheets',
  'Whiteboards',
  'Group texts',
  'Clipboards',
  'SOPs in Drive',
  'Email threads',
  'Shift notes',
];

const ORCHESTRA = [
  {
    title: 'People',
    body: 'Meetings and walkthroughs become assigned work. The team sees what matters today — not a shared inbox of vague notes.',
  },
  {
    title: 'Process',
    body: 'Hybrid tasks connect physical floor work to digital outcomes. Mark the move done; the plant map and compliance trail update.',
  },
  {
    title: 'Technology',
    body: 'One conversational layer across rooms, harvests, packages, and METRC-shaped state — so tools stop living in separate tabs.',
  },
];

const LOOP = [
  {
    title: 'Say it once',
    body: 'From standup or the floor: “Maya moves OG Kush to flower 1.” NeuroCann proposes the task and the system follow-through.',
  },
  {
    title: 'Team does the physical work',
    body: 'Assigned operators complete the action in the real world — gloves on, no form hunting mid-move.',
  },
  {
    title: 'Compliance writes itself',
    body: 'On complete, the system updates facility records and the METRC reporting path. You get visibility without chasing screenshots.',
  },
];

const START = [
  {
    title: 'Start with visibility',
    body: 'Connect METRC for the digital state of the facility — rooms, plants, packages — in one place.',
  },
  {
    title: 'Orchestrate one workflow',
    body: 'Pick the pain that burns this week: harvest day, moves, labs, trim. Conversational AI assigns and closes the loop.',
  },
  {
    title: 'Expand across departments',
    body: 'Cultivation, processing, packaging, procurement. Same orchestration layer — no rip-and-replace of how your team already works.',
  },
];

const INTEGRATIONS = ['METRC', 'Accounting', 'Sensors', 'Labs', 'SSO'];

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
      <a href="#main" className="fig-skip">
        Skip to content
      </a>

      <nav className={`fig-top ${solid ? 'is-solid' : ''}`} aria-label="Primary">
        <div className="fig-top-inner">
          <a
            href="#main"
            className="fig-logo"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <img src={logo} alt="" />
            <span>neurocann</span>
          </a>
          <div className="fig-top-actions">
            <a href="#how" className="fig-link">
              How it works
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

      {/* Hero — CareLink-style clarity, NeuroCann brand + live product */}
      <main id="main" className="fig-hero">
        <div className="fig-hero-copy">
          <p className="fig-brand">neurocann</p>
          <p className="fig-trust">Built by operators, for operators</p>
          <h1>
            End-to-end software that creates{' '}
            <em>agility in operations.</em>
          </h1>
          <p className="fig-lede">
            Square footage is fixed. Throughput isn’t — conversational AI so managers run people, process, and technology from one place, and the floor closes the loop to compliance.
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

        <div className="fig-prompts" role="group" aria-label="Try a demo prompt">
          {DEMO_SCENARIOS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              className={`fig-prompt ${i === scenarioIndex ? 'is-active' : ''}`}
              aria-pressed={i === scenarioIndex}
              onClick={() => setScenarioIndex(i)}
            >
              {s.prompt}
            </button>
          ))}
        </div>
      </main>

      {/* Records vs does — CareLink's killer line, adapted */}
      <section className="fig-do" aria-labelledby="fig-do-heading">
        <Reveal>
          <h2 id="fig-do-heading">
            Your current stack only records the work.
            <br />
            NeuroCann helps <em>do the work.</em>
          </h2>
          <p className="fig-do-lede">
            Most facilities juggle disconnected tools on top of METRC. NeuroCann consolidates the stack — then assigns the work, tracks completion, and updates compliance inside it.
          </p>
        </Reveal>
        <div className="fig-compare" role="group" aria-label="Tool consolidation">
          <div className="fig-compare-many">
            <p className="fig-compare-label">Today</p>
            <ul>
              {FRAGMENTS.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
          <div className="fig-compare-arrow" aria-hidden="true">
            →
          </div>
          <div className="fig-compare-one">
            <p className="fig-compare-label">With NeuroCann</p>
            <p className="fig-compare-platform">1 orchestration layer</p>
            <p className="fig-compare-note">People · process · technology</p>
          </div>
        </div>
      </section>

      <section className="fig-band" aria-labelledby="fig-orch-heading">
        <Reveal>
          <h2 id="fig-orch-heading">
            People. Process. Technology.
            <br />
            <span>One conversation holds them together.</span>
          </h2>
        </Reveal>
        <ul className="fig-split">
          {ORCHESTRA.map((item, i) => (
            <Reveal key={item.title} delay={i * 70}>
              <li>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            </Reveal>
          ))}
        </ul>
      </section>

      <section id="how" className="fig-band fig-band-alt" aria-labelledby="fig-loop-heading">
        <Reveal>
          <h2 id="fig-loop-heading">
            From the meeting to METRC —
            <br />
            <span>without the clipboard chase.</span>
          </h2>
          <p className="fig-section-lede">
            Say the work once. Assign it. When the team marks the physical action complete, NeuroCann updates the system of record and the compliance path.
          </p>
        </Reveal>
        <ol className="fig-loop">
          {LOOP.map((step, i) => (
            <Reveal key={step.title} delay={i * 80}>
              <li>
                <span className="fig-loop-n" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="fig-band" aria-labelledby="fig-start-heading">
        <Reveal>
          <h2 id="fig-start-heading">
            Start with one workflow.
            <br />
            <span>Expand across the facility.</span>
          </h2>
          <p className="fig-section-lede">
            Begin with METRC sync for instant visibility into the digital state of the facility — then grow orchestration into the departments that need it next.
          </p>
        </Reveal>
        <ul className="fig-start">
          {START.map((item, i) => (
            <Reveal key={item.title} delay={i * 70}>
              <li>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* Integration hub — CareLink pattern */}
      <section className="fig-hub" aria-labelledby="fig-hub-heading">
        <Reveal>
          <h2 id="fig-hub-heading">
            The layer above your systems —
            <br />
            <span>not another silo.</span>
          </h2>
        </Reveal>
        <div className="fig-hub-row" role="list">
          {INTEGRATIONS.map((name) => (
            <span key={name} className="fig-hub-chip" role="listitem">
              {name}
            </span>
          ))}
          <span className="fig-hub-core" role="listitem">
            neurocann
          </span>
        </div>
        <p className="fig-hub-note">
          METRC first. Accounting, sensors, labs, and SSO as you expand.{' '}
          <a href="mailto:will@neurocann.app?subject=NeuroCann%20Integration%20Request">
            Request an integration →
          </a>
        </p>
      </section>

      <section className="fig-band fig-band-alt" aria-labelledby="fig-experts-heading">
        <Reveal>
          <h2 id="fig-experts-heading">
            Built with operators.
            <br />
            <span>Ready to build what your team needs.</span>
          </h2>
          <p className="fig-section-lede">
            Cannabis operations experts sit on the product team. If your facility runs a workflow software has ignored, we shape NeuroCann around it.
          </p>
        </Reveal>
      </section>

      <section className="fig-close" aria-labelledby="fig-close-heading">
        <Reveal>
          <h2 id="fig-close-heading">
            See your facility’s digital state —
            <br />
            then orchestrate from there.
          </h2>
          <p>
            Book a working session. We’ll map one workflow, show METRC-backed visibility, and leave you with a path to expand.
          </p>
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
          --rhino: #5c5c5c;
          --dolphin: #8a8a8a;
          --koala: #f1f1f1;
          --white: #ffffff;
          --chameleon: #2f9e5f;
          --chameleon-ink: #062012;
          --canvas: #f7f7f5;
          --line: rgba(26, 26, 26, 0.12);
          --focus: #1c9eff;
          --font: 'Lato', system-ui, sans-serif;
          min-height: 100vh;
          background: var(--canvas);
          color: var(--panther);
          font-family: var(--font);
          overflow-x: hidden;
        }

        .fig-sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        .fig-skip {
          position: absolute;
          left: 1rem;
          top: -100px;
          z-index: 100;
          background: var(--panther);
          color: var(--white);
          padding: 0.65rem 1rem;
          border-radius: 0.4rem;
          font-weight: 700;
          font-size: 0.875rem;
          text-decoration: none;
        }
        .fig-skip:focus {
          top: 1rem;
          outline: 3px solid var(--focus);
          outline-offset: 2px;
        }

        .fig :is(a, button):focus-visible {
          outline: 3px solid var(--focus);
          outline-offset: 2px;
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
          background: rgba(247, 247, 245, 0.96);
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
          min-height: 44px;
        }
        .fig-logo img {
          width: 1.35rem;
          height: 1.35rem;
          object-fit: contain;
        }
        .fig-logo.is-muted {
          color: var(--rhino);
          font-size: 0.85rem;
          min-height: auto;
        }
        .fig-top-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
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
          padding: 0.5rem 0.35rem;
          min-height: 44px;
        }
        .fig-link:hover,
        .fig-link-btn:hover { color: var(--panther); }
        @media (min-width: 640px) {
          .fig-link, .fig-link-btn { display: inline-flex; align-items: center; }
        }
        .fig-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--panther);
          color: var(--white);
          text-decoration: none;
          font-size: 0.8125rem;
          font-weight: 700;
          padding: 0.55rem 0.95rem;
          border-radius: 0.5rem;
          min-height: 44px;
          transition: background 0.15s;
        }
        .fig-cta:hover { background: #000; }
        .fig-cta-lg {
          padding: 0.85rem 1.25rem;
          font-size: 0.9rem;
          background: var(--chameleon);
          color: var(--chameleon-ink);
        }
        .fig-cta-lg:hover { filter: brightness(1.06); background: var(--chameleon); }

        /* Hero */
        .fig-hero {
          padding: 5.5rem 1.5rem 3rem;
          max-width: 1200px;
          margin: 0 auto;
          display: block;
        }
        .fig-hero-copy {
          max-width: 40rem;
          margin: 0 auto 2.5rem;
          text-align: center;
          opacity: 0;
          animation: figIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.05s forwards;
        }
        .fig-brand {
          margin: 0 0 0.55rem;
          font-size: clamp(2.5rem, 7vw, 4rem);
          font-weight: 900;
          letter-spacing: -0.045em;
          line-height: 1;
          color: var(--panther);
        }
        .fig-trust {
          margin: 0 0 1rem;
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--rhino);
        }
        .fig-hero h1 {
          margin: 0 0 0.85rem;
          font-size: clamp(1.45rem, 3.4vw, 2rem);
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.25;
          color: var(--panther);
          max-width: 22em;
          margin-left: auto;
          margin-right: auto;
        }
        .fig-hero h1 em,
        .fig-do h2 em {
          font-style: normal;
          color: var(--chameleon);
          font-weight: 900;
        }
        .fig-lede {
          margin: 0 auto 1.5rem;
          max-width: 32rem;
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
          justify-content: center;
          background: var(--white);
          color: var(--panther);
          text-decoration: none;
          font: inherit;
          font-size: 0.9rem;
          font-weight: 700;
          padding: 0.8rem 1.2rem;
          border-radius: 0.5rem;
          border: 1.5px solid var(--dolphin);
          cursor: pointer;
          min-height: 44px;
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
          color: var(--chameleon-ink);
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
          min-height: 0;
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
          color: #1a5c38;
          background: rgba(47, 158, 95, 0.16);
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
          min-height: 0;
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
          opacity: 0.45;
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
          color: var(--rhino);
          font-weight: 400;
        }
        .fig-mic {
          background: none;
          border: none;
          color: var(--chameleon);
          padding: 0.35rem;
          display: flex;
          cursor: default;
          min-width: 44px;
          min-height: 44px;
          align-items: center;
          justify-content: center;
        }

        .fig-prompts {
          display: flex;
          gap: 0.5rem;
          overflow-x: auto;
          padding: 1.25rem 0 0;
          scrollbar-width: thin;
        }
        .fig-prompt {
          flex: 0 0 auto;
          background: var(--white);
          border: 1.5px solid var(--line);
          color: var(--rhino);
          font: inherit;
          font-size: 0.8rem;
          font-weight: 700;
          padding: 0.7rem 0.9rem;
          border-radius: 0.45rem;
          cursor: pointer;
          max-width: 18rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-height: 44px;
          transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .fig-prompt:hover {
          border-color: var(--dolphin);
          color: var(--panther);
        }
        .fig-prompt.is-active {
          border-color: var(--chameleon);
          color: #1a5c38;
          background: rgba(47, 158, 95, 0.1);
        }

        /* Records vs does + consolidation */
        .fig-do {
          max-width: 1200px;
          margin: 0 auto;
          padding: 4.5rem 1.5rem 2rem;
          border-top: 1px solid var(--line);
          text-align: center;
        }
        .fig-do h2 {
          margin: 0 auto 1rem;
          max-width: 22em;
          font-size: clamp(1.65rem, 3.8vw, 2.45rem);
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.2;
        }
        .fig-do-lede {
          margin: 0 auto 2.5rem;
          max-width: 36rem;
          color: var(--rhino);
          font-size: 1.05rem;
          line-height: 1.55;
        }
        .fig-compare {
          display: grid;
          gap: 1.5rem;
          align-items: stretch;
          text-align: left;
          max-width: 52rem;
          margin: 0 auto;
        }
        @media (min-width: 720px) {
          .fig-compare {
            grid-template-columns: 1fr auto 1fr;
            gap: 1.75rem;
            align-items: center;
          }
        }
        .fig-compare-label {
          margin: 0 0 0.85rem;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--dolphin);
        }
        .fig-compare-many ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.45rem 1rem;
        }
        .fig-compare-many li {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--rhino);
          padding: 0.35rem 0;
          border-bottom: 1px solid var(--line);
        }
        .fig-compare-arrow {
          display: none;
          font-size: 1.75rem;
          font-weight: 900;
          color: var(--chameleon);
          text-align: center;
        }
        @media (min-width: 720px) {
          .fig-compare-arrow { display: block; }
        }
        .fig-compare-one {
          padding-top: 0.25rem;
        }
        @media (min-width: 720px) {
          .fig-compare-one {
            border-left: 2px solid var(--chameleon);
            padding-left: 1.35rem;
          }
        }
        .fig-compare-platform {
          margin: 0 0 0.45rem;
          font-size: clamp(1.35rem, 2.5vw, 1.75rem);
          font-weight: 900;
          letter-spacing: -0.03em;
          color: var(--panther);
          line-height: 1.2;
        }
        .fig-compare-note {
          margin: 0;
          color: var(--rhino);
          font-size: 0.95rem;
          font-weight: 700;
        }

        /* Integration hub */
        .fig-hub {
          max-width: 1200px;
          margin: 0 auto;
          padding: 4.5rem 1.5rem;
          border-top: 1px solid var(--line);
          text-align: center;
        }
        .fig-hub h2 {
          margin: 0 auto 2rem;
          max-width: 22em;
          font-size: clamp(1.65rem, 3.8vw, 2.35rem);
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.15;
        }
        .fig-hub h2 span {
          color: var(--rhino);
          font-weight: 700;
        }
        .fig-hub-row {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          align-items: center;
          gap: 0.65rem 0.85rem;
          margin: 0 auto 1.25rem;
          max-width: 40rem;
        }
        .fig-hub-chip {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--rhino);
          padding: 0.55rem 0.85rem;
          border: 1.5px solid var(--line);
          border-radius: 0.45rem;
          background: var(--white);
        }
        .fig-hub-core {
          font-size: 0.95rem;
          font-weight: 900;
          letter-spacing: -0.02em;
          color: var(--chameleon-ink);
          background: var(--chameleon);
          padding: 0.6rem 1rem;
          border-radius: 0.45rem;
        }
        .fig-hub-note {
          margin: 0 auto;
          max-width: 28rem;
          color: var(--rhino);
          font-size: 0.95rem;
          line-height: 1.5;
        }
        .fig-hub-note a {
          color: var(--panther);
          font-weight: 700;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .fig-hub-note a:hover { color: var(--chameleon); }

        /* Narrative bands */
        .fig-band {
          max-width: 1200px;
          margin: 0 auto;
          padding: 4.5rem 1.5rem;
          border-top: 1px solid var(--line);
        }
        .fig-band-alt {
          background: var(--white);
          max-width: none;
          padding-left: max(1.5rem, calc((100% - 1200px) / 2 + 1.5rem));
          padding-right: max(1.5rem, calc((100% - 1200px) / 2 + 1.5rem));
        }
        .fig-band h2 {
          margin: 0 0 0.75rem;
          font-size: clamp(1.65rem, 3.8vw, 2.35rem);
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.15;
          max-width: 28rem;
        }
        .fig-band h2 span {
          color: var(--rhino);
          font-weight: 700;
        }
        .fig-section-lede {
          margin: 0 0 2.25rem;
          max-width: 36rem;
          color: var(--rhino);
          font-size: 1.05rem;
          line-height: 1.55;
        }
        .fig-split {
          list-style: none;
          margin: 2rem 0 0;
          padding: 0;
          display: grid;
          gap: 2rem;
          border-top: 1px solid var(--line);
        }
        @media (min-width: 800px) {
          .fig-split {
            grid-template-columns: repeat(3, 1fr);
            gap: 2.25rem;
          }
        }
        .fig-split li {
          padding-top: 1.25rem;
          border-top: 2px solid var(--chameleon);
        }
        @media (min-width: 800px) {
          .fig-split li {
            border-top: none;
            padding-top: 0;
            border-left: 2px solid var(--chameleon);
            padding-left: 1.15rem;
          }
        }
        .fig-split h3,
        .fig-loop h3,
        .fig-start h3 {
          margin: 0 0 0.45rem;
          font-size: 1.1rem;
          font-weight: 900;
          letter-spacing: -0.02em;
        }
        .fig-split p,
        .fig-loop p,
        .fig-start p {
          margin: 0;
          color: var(--rhino);
          font-size: 0.95rem;
          line-height: 1.55;
        }

        .fig-loop {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 2rem;
        }
        @media (min-width: 800px) {
          .fig-loop {
            grid-template-columns: repeat(3, 1fr);
            gap: 2rem;
          }
        }
        .fig-loop-n {
          display: block;
          font-size: 0.75rem;
          font-weight: 900;
          letter-spacing: 0.06em;
          color: var(--chameleon);
          margin-bottom: 0.55rem;
          font-variant-numeric: tabular-nums;
        }

        .fig-start {
          list-style: none;
          margin: 0;
          padding: 0;
          border-top: 1px solid var(--line);
        }
        .fig-start li {
          display: grid;
          gap: 0.35rem;
          padding: 1.35rem 0;
          border-bottom: 1px solid var(--line);
        }
        @media (min-width: 720px) {
          .fig-start li {
            grid-template-columns: 14rem 1fr;
            gap: 1.5rem;
            align-items: baseline;
          }
        }

        .fig-close {
          max-width: 38rem;
          margin: 0 auto;
          padding: 4rem 1.5rem 5rem;
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
          0% { box-shadow: 0 0 0 0 rgba(47, 158, 95, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(47, 158, 95, 0); }
          100% { box-shadow: 0 0 0 0 rgba(47, 158, 95, 0); }
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
