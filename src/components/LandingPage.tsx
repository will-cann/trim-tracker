import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/authContext';
import type { ProposedAction } from '../types/definitions';

/* ─── Scroll-reveal ─── */
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

const Reveal: React.FC<{
  children: React.ReactNode;
  className?: string;
  delay?: number;
}> = ({ children, className = '', delay = 0 }) => {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(16px)',
        transition: `opacity 0.55s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.55s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

type DemoStep =
  | { type: 'user'; text: string }
  | { type: 'ai'; text: string }
  | { type: 'actions'; actions: ProposedAction[]; lines: string[] }
  | { type: 'confirmed' }
  | { type: 'pause'; ms: number };

const DEMO_SCENARIOS: { label: string; prompt: string; steps: DemoStep[] }[] = [
  {
    label: 'move',
    prompt: 'move og-kush veg-2 → flower-1',
    steps: [
      { type: 'user', text: 'Move the OG Kush from veg 2 to flower 1' },
      { type: 'ai', text: 'resolving batch… 24 plants · phase → flower' },
      {
        type: 'actions',
        actions: [{ type: 'move_plants', data: { strain: 'OG Kush', fromRoom: 'Veg Room 2', toRoom: 'Flower Room 1', plantCount: 24 } }],
        lines: [
          'move_plants   strain=OG Kush',
          '              from=veg-2  to=flower-1  n=24',
        ],
      },
      { type: 'pause', ms: 1800 },
      { type: 'confirmed' },
      { type: 'pause', ms: 2000 },
    ],
  },
  {
    label: 'weigh',
    prompt: 'weigh plant-7 512g + flag pm',
    steps: [
      { type: 'user', text: 'Plant 7 is 512 grams, has some PM' },
      { type: 'ai', text: 'logging weight · flagging powdery_mildew (minor)' },
      {
        type: 'actions',
        actions: [
          { type: 'record_plant_weight', data: { plantNumber: 7, weight: 512, harvestName: 'Wedding Cake #2' } },
          { type: 'flag_contamination', data: { plantNumber: 7, contaminationType: 'powdery_mildew', severity: 'minor' } },
        ],
        lines: [
          'record_plant_weight   plant=#7  weight=512g',
          'flag_contamination    type=pm  severity=minor',
        ],
      },
      { type: 'pause', ms: 1800 },
      { type: 'confirmed' },
      { type: 'pause', ms: 2000 },
    ],
  },
  {
    label: 'extract',
    prompt: 'start rosin · 2kg wedding-cake hash',
    steps: [
      { type: 'user', text: 'Start a rosin press run with 2kg of Wedding Cake bubble hash' },
      { type: 'ai', text: 'spinning run R-018 from bubble_hash inventory' },
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
        lines: [
          'start_extraction_run  template=hash→rosin',
          '                      input=2000g bubble_hash',
        ],
      },
      { type: 'pause', ms: 1800 },
      { type: 'confirmed' },
      { type: 'pause', ms: 2000 },
    ],
  },
  {
    label: 'order',
    prompt: 'po pacific-roots · 10cs rockwool',
    steps: [
      { type: 'user', text: 'Create a PO for Pacific Roots — 10 cases of rockwool, 5 cases of nutrients' },
      { type: 'ai', text: 'drafting PO-2026-041 · status=draft' },
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
        lines: [
          'create_order   vendor=pacific-roots',
          '               lines=rockwool×10  nutrients×5',
        ],
      },
      { type: 'pause', ms: 1800 },
      { type: 'confirmed' },
      { type: 'pause', ms: 2000 },
    ],
  },
  {
    label: 'package',
    prompt: 'pkg gelato 1lb · tag METRC-001234',
    steps: [
      { type: 'user', text: 'Create a 1lb flower package from the Gelato harvest, tag it METRC-001234' },
      { type: 'ai', text: 'creating package · assigning tag' },
      {
        type: 'actions',
        actions: [
          { type: 'create_package', data: { strain: 'Gelato', packageType: 'flower', weight: 453.6, harvestName: 'Gelato Harvest #2' } },
          { type: 'assign_tag', data: { tagId: '1A40-METRC-001234', target: 'package' } },
        ],
        lines: [
          'create_package   strain=Gelato  type=flower  wt=1lb',
          'assign_tag       id=1A40-METRC-001234',
        ],
      },
      { type: 'pause', ms: 1800 },
      { type: 'confirmed' },
      { type: 'pause', ms: 2000 },
    ],
  },
];

const FACILITY_TREE = [
  { path: 'rooms/', detail: 'flower-1  flower-2  veg-a  dry-1' },
  { path: 'harvests/', detail: 'wedding-cake#2  active · 12/36 weighed' },
  { path: 'trim/', detail: 'gdp#4  session · 6 trimmers' },
  { path: 'extract/', detail: 'R-018  hash→rosin · step 3/5' },
  { path: 'packages/', detail: '186 active · 16 lab-pending' },
  { path: 'orders/', detail: 'PO-041  pacific-roots · sent' },
];

const MainframeDemo: React.FC<{
  scenarioIndex: number;
  onScenarioComplete: () => void;
  autoplay: boolean;
}> = ({ scenarioIndex, onScenarioComplete, autoplay }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [typingText, setTypingText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [lines, setLines] = useState<Array<{ kind: 'in' | 'out' | 'ok' | 'sys'; text: string }>>([]);
  const [pendingLines, setPendingLines] = useState<string[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const runId = useRef(0);
  const pendingRef = useRef<string[] | null>(null);
  const onCompleteRef = useRef(onScenarioComplete);
  onCompleteRef.current = onScenarioComplete;

  const scenario = DEMO_SCENARIOS[scenarioIndex];

  useEffect(() => {
    runId.current += 1;
    setStepIndex(0);
    setLines([]);
    setPendingLines(null);
    pendingRef.current = null;
    setConfirmed(false);
    setTypingText('');
    setIsTyping(false);
  }, [scenarioIndex]);

  useEffect(() => {
    if (!autoplay) return;
    const thisRun = runId.current;
    const steps = scenario.steps;

    if (stepIndex >= steps.length) {
      const timeout = setTimeout(() => {
        if (runId.current === thisRun) onCompleteRef.current();
      }, 400);
      return () => clearTimeout(timeout);
    }

    const step = steps[stepIndex];

    if (step.type === 'user' || step.type === 'ai') {
      setIsTyping(true);
      let charIndex = 0;
      let advanceTimeout: ReturnType<typeof setTimeout> | undefined;
      const speed = step.type === 'user' ? 22 : 12;
      const typeInterval = setInterval(() => {
        if (runId.current !== thisRun) {
          clearInterval(typeInterval);
          return;
        }
        if (charIndex <= step.text.length) {
          setTypingText(step.text.slice(0, charIndex));
          charIndex++;
        } else {
          clearInterval(typeInterval);
          setIsTyping(false);
          setLines((prev) => [
            ...prev,
            { kind: step.type === 'user' ? 'in' : 'out', text: step.text },
          ]);
          setTypingText('');
          advanceTimeout = setTimeout(() => {
            if (runId.current === thisRun) setStepIndex((s) => s + 1);
          }, 280);
        }
      }, speed);
      return () => {
        clearInterval(typeInterval);
        if (advanceTimeout) clearTimeout(advanceTimeout);
      };
    }

    if (step.type === 'actions') {
      const timeout = setTimeout(() => {
        if (runId.current !== thisRun) return;
        pendingRef.current = step.lines;
        setPendingLines(step.lines);
        setConfirmed(false);
        setStepIndex((s) => s + 1);
      }, 220);
      return () => clearTimeout(timeout);
    }

    if (step.type === 'confirmed') {
      setConfirmed(true);
      const timeout = setTimeout(() => {
        if (runId.current !== thisRun) return;
        const pending = pendingRef.current;
        if (pending) {
          setLines((prev) => [
            ...prev,
            ...pending.map((t) => ({ kind: 'ok' as const, text: t })),
          ]);
        }
        pendingRef.current = null;
        setPendingLines(null);
        setStepIndex((s) => s + 1);
      }, 90);
      return () => clearTimeout(timeout);
    }

    if (step.type === 'pause') {
      const timeout = setTimeout(() => {
        if (runId.current === thisRun) setStepIndex((s) => s + 1);
      }, step.ms);
      return () => clearTimeout(timeout);
    }
  }, [stepIndex, scenario, autoplay]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines, typingText, pendingLines, confirmed]);

  const currentStep = stepIndex < scenario.steps.length ? scenario.steps[stepIndex] : null;
  const typingKind =
    currentStep && (currentStep.type === 'user' || currentStep.type === 'ai')
      ? currentStep.type
      : null;

  return (
    <div className="mf-term">
      <div className="mf-term-bar">
        <span className="mf-term-dots" aria-hidden>
          <i /><i /><i />
        </span>
        <span className="mf-term-title">neurocann@facility — ssh session</span>
        <span className="mf-term-live">
          <i className="mf-blink-dot" />
          LIVE
        </span>
      </div>
      <div ref={bodyRef} className="mf-term-body">
        <div className="mf-sys"># connected · license=CA-A12 · rooms=4 · ambient=on</div>
        {lines.map((line, i) => (
          <div key={i} className={`mf-line is-${line.kind}`}>
            {line.kind === 'in' && <span className="mf-prompt">›</span>}
            {line.kind === 'out' && <span className="mf-prompt is-out">↳</span>}
            {line.kind === 'ok' && <span className="mf-prompt is-ok">✓</span>}
            <span>{line.text}</span>
          </div>
        ))}
        {typingKind && (
          <div className={`mf-line is-${typingKind === 'user' ? 'in' : 'out'}`}>
            <span className={`mf-prompt ${typingKind === 'ai' ? 'is-out' : ''}`}>
              {typingKind === 'user' ? '›' : '↳'}
            </span>
            <span>
              {typingText}
              {isTyping && <span className="mf-caret" />}
            </span>
          </div>
        )}
        {pendingLines && (
          <div className={`mf-pending ${confirmed ? 'is-done' : ''}`}>
            <div className="mf-pending-head">
              {confirmed ? 'applied' : 'propose'} · {pendingLines.length} action
              {pendingLines.length === 1 ? '' : 's'}
            </div>
            {pendingLines.map((t) => (
              <div key={t} className="mf-pending-line">
                <span>{confirmed ? '✓' : '·'}</span> {t}
              </div>
            ))}
            {!confirmed && <div className="mf-pending-hint">awaiting confirm_</div>}
          </div>
        )}
        {!typingKind && !pendingLines && (
          <div className="mf-line is-in">
            <span className="mf-prompt">›</span>
            <span className="mf-caret" />
          </div>
        )}
      </div>
    </div>
  );
};

export const LandingPage: React.FC = () => {
  const { login } = useAuth();
  const [scrollY, setScrollY] = useState(0);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [autoplay] = useState(true);

  useEffect(() => {
    let solid = false;
    const onScroll = () => {
      const next = window.scrollY > 16;
      if (next !== solid) {
        solid = next;
        setScrollY(next ? 17 : 0);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navSolid = scrollY > 16;

  const onScenarioComplete = () => {
    setScenarioIndex((s) => (s + 1) % DEMO_SCENARIOS.length);
  };

  return (
    <div className="mf">
      <nav className={`mf-nav ${navSolid ? 'is-solid' : ''}`}>
        <div className="mf-nav-inner">
          <a
            href="#"
            className="mf-brand"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <span className="mf-brand-mark">◈</span>
            neurocann
          </a>
          <div className="mf-nav-right">
            <a href="#access" className="mf-nav-link">access</a>
            <a href="#fs" className="mf-nav-link">filesystem</a>
            <button type="button" className="mf-nav-ghost" onClick={() => login()}>
              sign in
            </button>
            <a
              href="mailto:will@neurocann.app?subject=NeuroCann%20Demo%20Request"
              className="mf-nav-cta"
            >
              get access →
            </a>
          </div>
        </div>
      </nav>

      {/* Hero: brand + mainframe + terminal plane */}
      <header className="mf-hero">
        <div className="mf-scan" aria-hidden />
        <div className="mf-hero-copy">
          <p className="mf-wordmark">neurocann</p>
          <h1>
            Mainframe access
            <br />
            to your <em>grow.</em>
          </h1>
          <p className="mf-lede">
            AI-native ops console. Speak once — every room, harvest, tag, and PO updates. Total control from one session.
          </p>
          <div className="mf-cta">
            <a
              href="mailto:will@neurocann.app?subject=NeuroCann%20Demo%20Request"
              className="mf-btn-primary"
            >
              request access
            </a>
            <a href="#demo" className="mf-btn-ghost">
              ./watch_demo
            </a>
          </div>
        </div>

        <div className="mf-hero-term" id="demo">
          <MainframeDemo
            scenarioIndex={scenarioIndex}
            onScenarioComplete={onScenarioComplete}
            autoplay={autoplay}
          />
        </div>
      </header>

      {/* Runnable commands */}
      <section className="mf-cmds" aria-label="Try a command">
        <div className="mf-cmds-inner">
          <span className="mf-label">$ history — click to replay</span>
          <div className="mf-cmd-row">
            {DEMO_SCENARIOS.map((s, i) => (
              <button
                key={s.label}
                type="button"
                className={`mf-cmd ${i === scenarioIndex ? 'is-active' : ''}`}
                onClick={() => setScenarioIndex(i)}
              >
                <span className="mf-cmd-hash">{s.label}</span>
                {s.prompt}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Filesystem / modules */}
      <section id="fs" className="mf-fs">
        <Reveal>
          <p className="mf-label">~/facility</p>
          <h2>
            One mount point.
            <br />
            <span>Entire operation.</span>
          </h2>
          <p className="mf-section-lede">
            Cultivation, harvest, trim, extraction, packages, ordering — same session, same permissions, same audit trail.
          </p>
        </Reveal>
        <ul className="mf-tree">
          {FACILITY_TREE.map((node, i) => (
            <Reveal key={node.path} delay={i * 50}>
              <li>
                <code className="mf-path">{node.path}</code>
                <span className="mf-path-detail">{node.detail}</span>
              </li>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* Pipeline */}
      <section id="access" className="mf-pipe">
        <Reveal>
          <p className="mf-label">pipeline</p>
          <h2>
            speak | review | exec
          </h2>
        </Reveal>
        <ol className="mf-pipe-steps">
          {[
            { sh: 'stdin', title: 'Speak or type', body: 'Natural language in. No forms. No menu archaeology.' },
            { sh: 'diff', title: 'Review the propose', body: 'Every write is a proposed action. You see the patch before it lands.' },
            { sh: 'commit', title: 'Confirm once', body: 'One keystroke. Plant map, harvest logs, packages, compliance — all sync.' },
          ].map((step, i) => (
            <Reveal key={step.sh} delay={i * 80}>
              <li>
                <code>{step.sh}</code>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* Ambient as daemon */}
      <section className="mf-daemon">
        <Reveal>
          <p className="mf-label">daemon · ambient</p>
          <h2>
            always listening
            <br />
            <span>never blocking</span>
          </h2>
          <p className="mf-section-lede">
            Background process on the floor. Weights, flags, tasks queue while you work. Review when you want — not when the UI wants.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <pre className="mf-log" aria-hidden>
{`[02:14]  recv  "plant seven five twelve, little pm"
[02:14]  queue record_plant_weight plant=#7 512g
[02:14]  queue flag_contamination  pm minor
[02:17]  recv  "plant eight four seventy eight clean"
[02:17]  queue record_plant_weight plant=#8 478g
[02:34]  recv  "order forty cases rockwool pacific"
[02:34]  queue create_order …  status=needs_review`}
          </pre>
        </Reveal>
      </section>

      {/* Close */}
      <section className="mf-close">
        <Reveal>
          <p className="mf-label">root@neurocann</p>
          <h2>
            You already think
            <br />
            in commands.
            <br />
            <em>So does your facility.</em>
          </h2>
          <p className="mf-section-lede">
            Built by operators who lived in rooms, harvests, and trim tables. The console we wished we had at 2am.
          </p>
          <div className="mf-cta">
            <a
              href="mailto:will@neurocann.app?subject=NeuroCann%20Demo%20Request"
              className="mf-btn-primary"
            >
              request access
            </a>
            <button type="button" className="mf-btn-ghost" onClick={() => login()}>
              sign in
            </button>
          </div>
        </Reveal>
      </section>

      <footer className="mf-foot">
        <span>neurocann · facility os</span>
        <span>© {new Date().getFullYear()}</span>
      </footer>

      <style>{`
        .mf {
          --bg: #070a08;
          --bg-elev: #0d1310;
          --bg-panel: #0a100d;
          --line: rgba(90, 255, 160, 0.14);
          --line-strong: rgba(90, 255, 160, 0.28);
          --ink: #e8f5ec;
          --muted: #7a9a86;
          --dim: #4d6a58;
          --green: #5dff9f;
          --green-dim: #2a8f55;
          --amber: #e6c35c;
          --mono: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
          --display: 'Syne', 'IBM Plex Mono', sans-serif;
          min-height: 100vh;
          background: var(--bg);
          color: var(--ink);
          font-family: var(--mono);
          font-size: 15px;
          line-height: 1.5;
          overflow-x: hidden;
        }

        .mf h1, .mf h2, .mf .mf-wordmark {
          font-family: var(--display);
          font-weight: 800;
          letter-spacing: -0.04em;
        }

        /* scanline atmosphere */
        .mf-scan {
          pointer-events: none;
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 50% at 70% 20%, rgba(93, 255, 159, 0.07), transparent 55%),
            radial-gradient(ellipse 50% 40% at 10% 80%, rgba(230, 195, 92, 0.04), transparent 50%),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0, 0, 0, 0.12) 2px,
              rgba(0, 0, 0, 0.12) 4px
            );
          z-index: 0;
          opacity: 0.85;
        }

        /* Nav */
        .mf-nav {
          position: fixed;
          inset: 0 0 auto 0;
          z-index: 40;
          border-bottom: 1px solid transparent;
          transition: background 0.25s, border-color 0.25s;
        }
        .mf-nav.is-solid {
          background: rgba(7, 10, 8, 0.92);
          backdrop-filter: blur(10px);
          border-bottom-color: var(--line);
        }
        .mf-nav-inner {
          max-width: 1120px;
          margin: 0 auto;
          padding: 0 1.25rem;
          height: 3.25rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .mf-brand {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          color: var(--ink);
          text-decoration: none;
          font-weight: 600;
          font-size: 0.9rem;
          letter-spacing: -0.02em;
        }
        .mf-brand-mark {
          color: var(--green);
          font-size: 0.85rem;
        }
        .mf-nav-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .mf-nav-link {
          display: none;
          color: var(--muted);
          text-decoration: none;
          font-size: 0.78rem;
        }
        .mf-nav-link:hover { color: var(--green); }
        @media (min-width: 640px) {
          .mf-nav-link { display: inline; }
        }
        .mf-nav-ghost {
          background: none;
          border: none;
          color: var(--ink);
          font: inherit;
          font-size: 0.78rem;
          cursor: pointer;
          padding: 0;
        }
        .mf-nav-ghost:hover { color: var(--green); }
        .mf-nav-cta {
          color: var(--bg);
          background: var(--green);
          text-decoration: none;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.4rem 0.7rem;
          border: 1px solid var(--green);
        }
        .mf-nav-cta:hover { filter: brightness(1.08); }

        /* Hero */
        .mf-hero {
          position: relative;
          min-height: 100svh;
          display: grid;
          gap: 2rem;
          padding: 5rem 1.25rem 2rem;
          align-items: end;
        }
        @media (min-width: 960px) {
          .mf-hero {
            grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.15fr);
            align-items: center;
            max-width: 1160px;
            margin: 0 auto;
            padding: 5.5rem 1.5rem 2.5rem;
            gap: 2.75rem;
          }
        }
        .mf-hero-copy,
        .mf-hero-term {
          position: relative;
          z-index: 1;
          opacity: 0;
          animation: mfRise 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.08s forwards;
        }
        .mf-hero-term { animation-delay: 0.2s; }

        .mf-wordmark {
          margin: 0 0 0.85rem;
          font-size: clamp(2.6rem, 8vw, 4.75rem);
          line-height: 0.88;
          color: var(--ink);
        }
        .mf-wordmark::after {
          content: '_';
          color: var(--green);
          animation: mfBlink 1.05s step-end infinite;
        }
        .mf-hero h1 {
          margin: 0 0 1rem;
          font-size: clamp(1.65rem, 4.2vw, 2.55rem);
          line-height: 1.08;
          color: var(--ink);
        }
        .mf-hero h1 em {
          font-style: normal;
          color: var(--green);
        }
        .mf-lede {
          margin: 0 0 1.5rem;
          max-width: 28rem;
          color: var(--muted);
          font-size: 0.92rem;
          line-height: 1.55;
          font-weight: 400;
        }
        .mf-cta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.65rem;
        }
        .mf-btn-primary {
          display: inline-flex;
          align-items: center;
          background: var(--green);
          color: #041208;
          text-decoration: none;
          font-weight: 700;
          font-size: 0.82rem;
          padding: 0.75rem 1.05rem;
          border: 1px solid var(--green);
          transition: filter 0.15s, transform 0.15s;
        }
        .mf-btn-primary:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
        .mf-btn-ghost {
          display: inline-flex;
          align-items: center;
          background: transparent;
          color: var(--green);
          text-decoration: none;
          font: inherit;
          font-size: 0.82rem;
          font-weight: 500;
          padding: 0.75rem 1.05rem;
          border: 1px solid var(--line-strong);
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .mf-btn-ghost:hover {
          border-color: var(--green);
          color: var(--ink);
        }

        /* Terminal */
        .mf-term {
          background: var(--bg-panel);
          border: 1px solid var(--line-strong);
          display: flex;
          flex-direction: column;
          min-height: 340px;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4), 0 24px 80px rgba(0, 0, 0, 0.45);
        }
        .mf-term-bar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.55rem 0.75rem;
          border-bottom: 1px solid var(--line);
          background: var(--bg-elev);
          font-size: 0.7rem;
          color: var(--dim);
        }
        .mf-term-dots {
          display: flex;
          gap: 0.3rem;
        }
        .mf-term-dots i {
          width: 0.45rem;
          height: 0.45rem;
          border-radius: 50%;
          background: var(--dim);
          display: block;
        }
        .mf-term-dots i:nth-child(1) { background: #c45c5c; }
        .mf-term-dots i:nth-child(2) { background: #c4a35c; }
        .mf-term-dots i:nth-child(3) { background: #5cc48a; }
        .mf-term-title {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--muted);
        }
        .mf-term-live {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          color: var(--green);
          font-weight: 600;
          letter-spacing: 0.06em;
          font-size: 0.65rem;
        }
        .mf-blink-dot {
          width: 0.4rem;
          height: 0.4rem;
          border-radius: 50%;
          background: var(--green);
          display: block;
          animation: mfPulse 1.6s ease-out infinite;
        }
        .mf-term-body {
          padding: 1rem 1rem 1.15rem;
          flex: 1;
          overflow-y: auto;
          max-height: 380px;
          font-size: 0.82rem;
          line-height: 1.55;
        }
        .mf-sys {
          color: var(--dim);
          margin-bottom: 0.85rem;
          font-size: 0.72rem;
        }
        .mf-line {
          display: flex;
          gap: 0.55rem;
          margin-bottom: 0.35rem;
          word-break: break-word;
        }
        .mf-prompt {
          color: var(--green);
          flex-shrink: 0;
          font-weight: 600;
        }
        .mf-prompt.is-out { color: var(--amber); }
        .mf-prompt.is-ok { color: var(--green); }
        .mf-line.is-in { color: var(--ink); }
        .mf-line.is-out { color: var(--muted); }
        .mf-line.is-ok { color: var(--green-dim); }
        .mf-caret {
          display: inline-block;
          width: 0.55em;
          height: 1em;
          background: var(--green);
          margin-left: 1px;
          vertical-align: -0.12em;
          animation: mfBlink 1.05s step-end infinite;
        }
        .mf-pending {
          margin: 0.65rem 0;
          padding: 0.65rem 0.75rem;
          border: 1px dashed var(--line-strong);
          background: rgba(93, 255, 159, 0.04);
        }
        .mf-pending.is-done {
          border-style: solid;
          border-color: var(--green-dim);
        }
        .mf-pending-head {
          color: var(--amber);
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-bottom: 0.4rem;
        }
        .mf-pending.is-done .mf-pending-head { color: var(--green); }
        .mf-pending-line {
          color: var(--muted);
          font-size: 0.78rem;
          white-space: pre-wrap;
        }
        .mf-pending-line span { color: var(--green); }
        .mf-pending-hint {
          margin-top: 0.45rem;
          color: var(--dim);
          font-size: 0.7rem;
        }

        /* Commands */
        .mf-cmds {
          padding: 0 1.25rem 3rem;
          position: relative;
          z-index: 2;
        }
        .mf-cmds-inner {
          max-width: 1120px;
          margin: 0 auto;
        }
        .mf-label {
          display: block;
          font-size: 0.7rem;
          color: var(--dim);
          letter-spacing: 0.08em;
          text-transform: lowercase;
          margin: 0 0 0.75rem;
        }
        .mf-cmd-row {
          display: flex;
          gap: 0.45rem;
          overflow-x: auto;
          padding-bottom: 0.25rem;
          scrollbar-width: none;
        }
        .mf-cmd-row::-webkit-scrollbar { display: none; }
        .mf-cmd {
          flex: 0 0 auto;
          background: transparent;
          border: 1px solid var(--line);
          color: var(--muted);
          font: inherit;
          font-size: 0.75rem;
          padding: 0.55rem 0.7rem;
          cursor: pointer;
          text-align: left;
          max-width: 20rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .mf-cmd-hash {
          color: var(--dim);
          margin-right: 0.45rem;
        }
        .mf-cmd:hover {
          border-color: var(--line-strong);
          color: var(--ink);
        }
        .mf-cmd.is-active {
          border-color: var(--green);
          color: var(--green);
          background: rgba(93, 255, 159, 0.06);
        }

        /* Filesystem */
        .mf-fs,
        .mf-pipe,
        .mf-daemon,
        .mf-close {
          max-width: 1120px;
          margin: 0 auto;
          padding: 4.5rem 1.25rem;
        }
        .mf h2 {
          margin: 0 0 0.85rem;
          font-size: clamp(1.75rem, 4vw, 2.6rem);
          line-height: 1.05;
        }
        .mf h2 span { color: var(--muted); }
        .mf h2 em {
          font-style: normal;
          color: var(--green);
        }
        .mf-section-lede {
          margin: 0 0 2rem;
          max-width: 32rem;
          color: var(--muted);
          font-size: 0.9rem;
          line-height: 1.55;
        }
        .mf-tree {
          list-style: none;
          margin: 0;
          padding: 0;
          border-top: 1px solid var(--line);
        }
        .mf-tree li {
          display: grid;
          gap: 0.25rem;
          padding: 1rem 0;
          border-bottom: 1px solid var(--line);
        }
        @media (min-width: 700px) {
          .mf-tree li {
            grid-template-columns: 9rem 1fr;
            gap: 1.25rem;
            align-items: baseline;
          }
        }
        .mf-path {
          color: var(--green);
          font-size: 0.9rem;
          font-weight: 600;
        }
        .mf-path-detail {
          color: var(--muted);
          font-size: 0.85rem;
        }

        /* Pipeline */
        .mf-pipe {
          border-top: 1px solid var(--line);
        }
        .mf-pipe-steps {
          list-style: none;
          margin: 2rem 0 0;
          padding: 0;
          display: grid;
          gap: 1.75rem;
        }
        @media (min-width: 800px) {
          .mf-pipe-steps {
            grid-template-columns: repeat(3, 1fr);
            gap: 1.5rem;
          }
        }
        .mf-pipe-steps li {
          border-top: 1px solid var(--green);
          padding-top: 1rem;
        }
        .mf-pipe-steps code {
          display: block;
          color: var(--dim);
          font-size: 0.75rem;
          margin-bottom: 0.65rem;
        }
        .mf-pipe-steps h3 {
          margin: 0 0 0.45rem;
          font-family: var(--mono);
          font-size: 1rem;
          font-weight: 600;
          letter-spacing: -0.02em;
        }
        .mf-pipe-steps p {
          margin: 0;
          color: var(--muted);
          font-size: 0.85rem;
          line-height: 1.5;
        }

        /* Daemon */
        .mf-daemon {
          background: var(--bg-elev);
          border-top: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
          max-width: none;
          padding-left: max(1.25rem, calc((100% - 1120px) / 2 + 1.25rem));
          padding-right: max(1.25rem, calc((100% - 1120px) / 2 + 1.25rem));
        }
        .mf-log {
          margin: 0;
          padding: 1.1rem 1.15rem;
          background: var(--bg);
          border: 1px solid var(--line);
          color: var(--green-dim);
          font-size: 0.75rem;
          line-height: 1.65;
          overflow-x: auto;
          max-width: 40rem;
        }

        /* Close */
        .mf-close {
          text-align: left;
          padding-bottom: 5rem;
        }
        .mf-close .mf-section-lede { margin-bottom: 1.5rem; }

        .mf-foot {
          border-top: 1px solid var(--line);
          padding: 1.25rem;
          max-width: 1120px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          color: var(--dim);
          font-size: 0.72rem;
        }

        @keyframes mfRise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes mfBlink {
          50% { opacity: 0; }
        }
        @keyframes mfPulse {
          0% { box-shadow: 0 0 0 0 rgba(93, 255, 159, 0.45); }
          70% { box-shadow: 0 0 0 8px rgba(93, 255, 159, 0); }
          100% { box-shadow: 0 0 0 0 rgba(93, 255, 159, 0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .mf-scan,
          .mf-caret,
          .mf-wordmark::after,
          .mf-blink-dot {
            animation: none !important;
          }
          .mf-hero-copy,
          .mf-hero-term {
            opacity: 1 !important;
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
