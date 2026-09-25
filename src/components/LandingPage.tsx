import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../contexts/authContext';
import { ActionPreview } from './ActionPreview';
import { TypeChip } from './ui';
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
  | { type: 'pause'; ms: number }
  | { type: 'listening'; ms: number }
  | { type: 'assembling'; actions: ProposedAction[]; staggerMs?: number };

const STANDUP_TASKS: ProposedAction[] = [
  {
    type: 'create_human_task',
    data: { title: 'Check dry room RH', assignee: 'Jordan', priority: 'high', category: 'environmental' },
  },
  {
    type: 'create_human_task',
    data: { title: 'Restock rockwool', assignee: 'Sam', priority: 'medium', category: 'inventory' },
  },
  {
    type: 'create_human_task',
    data: { title: 'Pull pending lab results', assignee: 'Alisha', priority: 'medium', category: 'compliance' },
  },
];

const DEMO_SCENARIOS: { label: string; prompt: string; mode?: 'chat' | 'standup'; steps: DemoStep[] }[] = [
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
      { type: 'pause', ms: 3600 },
      { type: 'confirmed' },
      { type: 'pause', ms: 4000 },
    ],
  },
  {
    label: 'From standup',
    prompt: 'From standup',
    mode: 'standup',
    steps: [
      { type: 'listening', ms: 5000 },
      { type: 'assembling', actions: STANDUP_TASKS, staggerMs: 1300 },
      { type: 'pause', ms: 1000 },
      { type: 'actions', actions: STANDUP_TASKS },
      { type: 'pause', ms: 3600 },
      { type: 'confirmed' },
      { type: 'pause', ms: 4200 },
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
      { type: 'pause', ms: 3600 },
      { type: 'confirmed' },
      { type: 'pause', ms: 4000 },
    ],
  },
  {
    label: 'Visibility',
    prompt: 'What’s open in flower rooms and package inventory?',
    steps: [
      { type: 'user', text: 'What’s open in flower rooms and package inventory?' },
      {
        type: 'ai',
        text: `Here’s the live facility snapshot:

| Room | Strain | Plants | Health |
|------|--------|-------:|--------|
| Flower 1 | Wedding Cake | 48 | Healthy |
| Flower 2 | OG Kush | 36 | Watch list |

| Package | Type | Qty (g) | Lab |
|---------|------|--------:|-----|
| PKG-WC-F014 | Flower | 892.0 | Passed |
| PKG-OG-FF03 | Fresh frozen | 1,240.5 | Submitted |
| PKG-WC-R002 | Rosin | 186.2 | Not sent |
| PKG-BD-T011 | Trim | 420.0 | Passed |

**186** active packages · **16** lab pending.`,
      },
      { type: 'pause', ms: 7000 },
    ],
  },
];

/** Markdown with tables/lists — reveal whole message (don’t type pipe characters). */
function isStructuredReply(text: string) {
  return /\|.+\|/.test(text) || /^#{1,3}\s/m.test(text);
}

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
  const [listening, setListening] = useState(false);
  const [assembling, setAssembling] = useState<ProposedAction[] | null>(null);
  const [assembleCount, setAssembleCount] = useState(0);
  const [stageLabel, setStageLabel] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const runId = useRef(0);
  const onCompleteRef = useRef(onScenarioComplete);
  onCompleteRef.current = onScenarioComplete;

  const scenario = DEMO_SCENARIOS[scenarioIndex];
  const isStandup = scenario.mode === 'standup';

  useEffect(() => {
    runId.current += 1;
    setStepIndex(0);
    setMessages([]);
    setPendingActions(null);
    setActionStatus(undefined);
    setTypingText('');
    setIsTyping(false);
    setListening(false);
    setAssembling(null);
    setAssembleCount(0);
    setStageLabel(null);
  }, [scenarioIndex]);

  useEffect(() => {
    const thisRun = runId.current;
    const steps = scenario.steps;

    if (stepIndex >= steps.length) {
      const t = setTimeout(() => {
        if (runId.current === thisRun) onCompleteRef.current();
      }, 800);
      return () => clearTimeout(t);
    }

    const step = steps[stepIndex];

    if (step.type === 'listening') {
      setListening(true);
      setAssembling(null);
      setAssembleCount(0);
      setPendingActions(null);
      setActionStatus(undefined);
      setMessages([]);
      setStageLabel('Microphone listening');
      const t = setTimeout(() => {
        if (runId.current !== thisRun) return;
        setListening(false);
        setStepIndex((s) => s + 1);
      }, step.ms);
      return () => clearTimeout(t);
    }

    if (step.type === 'assembling') {
      setListening(false);
      setAssembling(step.actions);
      setAssembleCount(0);
      setPendingActions(null);
      setStageLabel('Action items assembling');
      const stagger = step.staggerMs ?? 1200;
      let n = 0;
      const iv = setInterval(() => {
        if (runId.current !== thisRun) {
          clearInterval(iv);
          return;
        }
        n += 1;
        setAssembleCount(n);
        if (n >= step.actions.length) {
          clearInterval(iv);
          setTimeout(() => {
            if (runId.current === thisRun) setStepIndex((s) => s + 1);
          }, 700);
        }
      }, stagger);
      return () => clearInterval(iv);
    }

    if (step.type === 'user' || step.type === 'ai') {
      setListening(false);
      setAssembling(null);
      setStageLabel(null);

      // Structured AI replies (tables, etc.) — reveal as a whole like the app,
      // not character-by-character (pipe typing breaks markdown).
      if (step.type === 'ai' && isStructuredReply(step.text)) {
        setIsTyping(false);
        setTypingText('');
        const t = setTimeout(() => {
          if (runId.current !== thisRun) return;
          setMessages((prev) => [...prev, { role: 'ai', text: step.text }]);
          setTimeout(() => {
            if (runId.current === thisRun) setStepIndex((s) => s + 1);
          }, 600);
        }, 450);
        return () => clearTimeout(t);
      }

      setIsTyping(true);
      let i = 0;
      let advance: ReturnType<typeof setTimeout> | undefined;
      const speed = step.type === 'user' ? 48 : 28;
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
          }, 600);
        }
      }, speed);
      return () => {
        clearInterval(iv);
        if (advance) clearTimeout(advance);
      };
    }

    if (step.type === 'actions') {
      setListening(false);
      setAssembling(null);
      setStageLabel(isStandup ? 'Action items assigned' : null);
      const t = setTimeout(() => {
        if (runId.current !== thisRun) return;
        setPendingActions(step.actions);
        setActionStatus(undefined);
        setStepIndex((s) => s + 1);
      }, 450);
      return () => clearTimeout(t);
    }

    if (step.type === 'confirmed') {
      setActionStatus('confirmed');
      if (isStandup) setStageLabel('Action items assigned');
      const t = setTimeout(() => {
        if (runId.current === thisRun) setStepIndex((s) => s + 1);
      }, 160);
      return () => clearTimeout(t);
    }

    if (step.type === 'pause') {
      const t = setTimeout(() => {
        if (runId.current === thisRun) setStepIndex((s) => s + 1);
      }, step.ms);
      return () => clearTimeout(t);
    }
  }, [stepIndex, scenario, isStandup]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, typingText, pendingActions, actionStatus, assembleCount, listening]);

  const current = stepIndex < scenario.steps.length ? scenario.steps[stepIndex] : null;
  const typingRole =
    current && (current.type === 'user' || current.type === 'ai') ? current.type : null;

  return (
    <div className="fig-chat">
      <div ref={bodyRef} className="fig-chat-body" aria-live="polite" aria-relevant="additions">
        {listening && (
          <div className="fig-listen" role="status">
            <div className="fig-listen-mic" aria-hidden="true">
              <span className="fig-listen-ring" />
              <span className="fig-listen-ring is-delay" />
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </div>
            <p className="fig-listen-title">Listening to standup…</p>
            <p className="fig-listen-sub">Ambient capture — no typing required</p>
            <div className="fig-wave" aria-hidden="true">
              {Array.from({ length: 9 }).map((_, i) => (
                <i key={i} style={{ animationDelay: `${i * 0.08}s` }} />
              ))}
            </div>
          </div>
        )}

        {assembling && (
          <div className="fig-assemble" role="status">
            <p className="fig-assemble-label">Assembling action items…</p>
            <ul className="fig-assemble-list">
              {assembling.slice(0, assembleCount).map((action, i) => {
                const d = action.data as Record<string, string>;
                return (
                  <li key={i} className="fig-assemble-card">
                    <span className="fig-assemble-title">{d.title}</span>
                    <span className="fig-assemble-chips">
                      <span className="fig-chip is-person">{d.assignee}</span>
                      <TypeChip palette="taskPriority" value={d.priority} />
                      <TypeChip palette="taskCategory" value={d.category} />
                    </span>
                  </li>
                );
              })}
              {assembleCount < assembling.length && (
                <li className="fig-assemble-card is-skeleton" aria-hidden="true">
                  <span className="fig-skel" />
                  <span className="fig-skel is-short" />
                </li>
              )}
            </ul>
          </div>
        )}

        {!listening && !assembling && messages.length === 0 && !typingText && !pendingActions && (
          <div className="fig-chat-empty">
            <img src={logo} alt="" className="fig-chat-empty-logo" />
            <p>Ask anything about the facility</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`fig-msg ${m.role === 'user' ? 'is-user' : 'is-ai'}${
              m.role === 'ai' && isStructuredReply(m.text) ? ' is-structured' : ''
            }`}
          >
            {m.role === 'user' ? (
              <>
                <span className="fig-sr-only">You said: </span>
                {m.text}
              </>
            ) : (
              <>
                <span className="fig-sr-only">NeuroCann: </span>
                <div className="ai-msg-bubble-assistant fig-md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                </div>
              </>
            )}
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
            {stageLabel && isStandup && (
              <p className="fig-assemble-label" style={{ marginBottom: '0.65rem' }}>
                {stageLabel}
              </p>
            )}
            <ActionPreview
              actions={pendingActions}
              readonly={actionStatus === 'confirmed'}
              status={actionStatus}
              {...(!actionStatus && { onConfirm: () => {}, onCancel: () => {} })}
            />
          </div>
        )}
      </div>
      <div className={`fig-composer ${listening ? 'is-listening' : ''}`} aria-hidden="true">
        {listening ? (
          <>
            <span className="fig-composer-placeholder is-live">Listening…</span>
            <span className="fig-mic is-live" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </span>
          </>
        ) : (
          <>
            <span className="fig-composer-placeholder">Talk or type a command…</span>
            <span className="fig-mic" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </span>
          </>
        )}
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

const BLOG_POSTS = [
  {
    slug: 'dollars-per-plant',
    title: 'Square footage is fixed. Dollars per plant aren’t.',
    excerpt:
      'How tracking what grows well, what runs well, and what sells well turns operational data into the next planting decision — and protects harvest revenue.',
    date: '2026-09-18',
  },
  {
    slug: 'standup-to-assigned',
    title: 'From standup to assigned work — without the clipboard chase.',
    excerpt:
      'Meetings become action items when ambient capture listens, assembles structured tasks, and assigns them before anyone opens a spreadsheet.',
    date: '2026-09-10',
  },
  {
    slug: 'early-health-flags',
    title: 'Catch plant health before it takes out a harvest.',
    excerpt:
      'Why contaminant catalogs and early flags matter more than another dashboard — and how floor voice keeps the record honest.',
    date: '2026-09-02',
  },
];

const MailingListForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setStatus('error');
      return;
    }
    const href = `mailto:will@neurocann.app?subject=${encodeURIComponent('NeuroCann mailing list')}&body=${encodeURIComponent(`Please add me to the NeuroCann mailing list.\n\nEmail: ${trimmed}`)}`;
    window.location.href = href;
    setStatus('ok');
    setEmail('');
  };

  return (
    <form className="fig-mail" onSubmit={onSubmit} noValidate>
      <label htmlFor="fig-mail-email" className="fig-sr-only">
        Email address
      </label>
      <input
        id="fig-mail-email"
        type="email"
        name="email"
        autoComplete="email"
        placeholder="you@facility.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (status !== 'idle') setStatus('idle');
        }}
        aria-invalid={status === 'error'}
        aria-describedby={status !== 'idle' ? 'fig-mail-status' : undefined}
      />
      <button type="submit" className="fig-cta">
        Join the list
      </button>
      <p id="fig-mail-status" className="fig-mail-status" role="status">
        {status === 'ok' && 'Thanks — finish sending the email to confirm.'}
        {status === 'error' && 'Enter a valid email address.'}
      </p>
    </form>
  );
};
const DEMO_MAIL = 'mailto:will@neurocann.app?subject=NeuroCann%20Demo%20Request';
const sandboxMail = (moduleName?: string) => {
  const subject = moduleName
    ? `NeuroCann Sandbox Access — ${moduleName}`
    : 'NeuroCann Sandbox Access Request';
  const body = moduleName
    ? `Hi — I'd like sandbox access to try ${moduleName}.`
    : "Hi — I'd like sandbox access to try NeuroCann.";
  return `mailto:will@neurocann.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

type ModuleDoc = {
  id: string;
  name: string;
  pitch: string;
  problem: string;
  value: string;
  capabilities: string[];
};

/** Copy sourced from docs/sales-marketing (claim only what ships). */
const MODULES: ModuleDoc[] = [
  {
    id: 'cultivation',
    name: 'Cultivation & Plant Map',
    pitch: 'See every room and strain group on one map — move plants, flip phases, and flag issues without leaving the floor.',
    problem: 'Operators lose track of what’s where, what’s due to flip or harvest, and which rooms are struggling.',
    value: 'One live facility view with strain-group health and a real contaminant catalog — not a decorative green ring.',
    capabilities: [
      'Room grid by phase with plant counts, strain mix, and health borders',
      'Bulk move, flip, health report, destroy, schedule harvest',
      'Contaminant catalog with health impact scoring',
    ],
  },
  {
    id: 'harvest',
    name: 'Harvest Pipeline',
    pitch: 'Plan the cut, weigh on harvest day, allocate flower vs frozen, hang, bin, and hand off to trim — one pipeline.',
    problem: 'Harvest day loses wet weights, waste, and contamination notes across clipboards and after-the-fact paperwork.',
    value: 'A six-stage pipeline plus a dedicated weighing cockpit. Flower and fresh frozen split in the same harvest.',
    capabilities: [
      'Planning → cutting → submitted → hanging → bucking → completed',
      'Harvest Day cockpit with per-plant or bulk wet weight',
      'Bins with cure logs and moisture for the handoff to trim',
    ],
  },
  {
    id: 'trim',
    name: 'Trim Sessions',
    pitch: 'One live session — multiple batches, assigned trimmers, flower/shake/waste weighed as you go, unfinished work rolls over.',
    problem: 'Trim floors lose accountability for who trimmed what and what unfinished work carries to the next shift.',
    value: 'Session + multi-batch + per-trimmer weight accounting on one screen, with rollover that keeps overnight work.',
    capabilities: [
      'Multi-batch entries with trimmer assignment',
      'Flower / shake / trim / waste weighed live',
      'Session submit with unfinished work rolling over',
    ],
  },
  {
    id: 'extraction',
    name: 'Extraction',
    pitch: 'Template the process, start from inventory, check in weights on steps, finish into packages — plan washes backward from finished goods.',
    problem: 'Multi-step SOPs run on paper yield sheets with no live link from biomass inventory to finished concentrate.',
    value: 'SOP-templated multi-step runs with inventory-linked inputs and outputs, plus backward planning from cart targets.',
    capabilities: [
      'Process templates with step weight/timestamp check-ins',
      'Start runs from source packages; finish into concentrate packages',
      'Planning calculator: target products → biomass and supply gaps',
    ],
  },
  {
    id: 'packaging',
    name: 'Packaging & Compliance',
    pitch: 'Finished inventory with lab states, audited adjusts, and plant/package tags — compliance trail built as you work.',
    problem: 'Finished goods live in spreadsheets or a disconnected compliance UI. Adjustments lack an audit trail.',
    value: 'Packages sit in the same AI/voice loop as harvest and trim. Tag pool ready for sync when the API lands.',
    capabilities: [
      'Flower, trim, shake, fresh frozen, hash, rosin, carts',
      'Lab testing states and audited quantity adjustments',
      'Plant / batch / package tag pool with assignment rules',
    ],
  },
  {
    id: 'ordering',
    name: 'Ordering & Procurement',
    pitch: 'Multi-store POs from vendor menus and POS sales velocity, plus AI-drafted biomass supplier email threads.',
    problem: 'Buying is guesswork — sales live in one system, vendor catalogs in another, outreach in inboxes.',
    value: 'Vendor product catalogs, velocity-informed POs, and supplier email drafts that land as tracked threads.',
    capabilities: [
      'Vendor menus and multi-store purchase order matrix',
      'POS sales CSV velocity for ordering decisions',
      'AI-drafted supplier outreach with inbound reply parse',
    ],
  },
  {
    id: 'sops',
    name: 'SOPs',
    pitch: 'Encode grow and extract as reusable templates — cultivation calendars and extraction process libraries with presets.',
    problem: 'Tribal knowledge lives in binders and Slack. New techs reinvent the process every cycle.',
    value: 'Cultivation calendars and extraction process libraries that the floor and AI both use.',
    capabilities: [
      'Cultivation schedule templates',
      'Extraction process library with 18+ presets',
      'Steps with durations, equipment, and supply requirements',
    ],
  },
  {
    id: 'reports',
    name: 'Reports & Analytics',
    pitch: 'Weekly trim labor productivity and cost-per-pound from the same sessions the floor just submitted.',
    problem: 'Managers export trim sessions to Excel to answer grams per hour and labor cost per pound.',
    value: 'Trim performance metrics live in the same app that captures the weights.',
    capabilities: [
      'Trim labor hours, avg g/hour, flower and trim lbs',
      'Trimmer stats and performance charts',
      'Wage slider → estimated labor $/lb',
    ],
  },
  {
    id: 'ai',
    name: 'AI & Voice',
    pitch: 'Talk to the facility — chat or mic — and confirm structured actions before they hit the database.',
    problem: 'Facility software forces tablet taps between every weight, move, and status change.',
    value: 'One conversational interface across modules. Propose → preview → confirm. Nothing mutates until you say yes.',
    capabilities: [
      'AI Home chat with Action Preview before execute',
      'Action-mode voice (Deepgram) into the same loop',
      'Screen-context aware prompts across the facility',
    ],
  },
  {
    id: 'tasks',
    name: 'Tasks',
    pitch: 'Capture work that still needs a human, with assignees, due dates, and hybrid physical-then-digital completion.',
    problem: 'Scouting, cleaning, and follow-ups fall through Slack and sticky notes.',
    value: 'AI can create tasks mid-conversation. Completing physical work can fire a digital follow-up.',
    capabilities: [
      'Priorities, categories, assignees, due dates',
      'Cards / table / calendar views',
      'Hybrid onCompleteAction for physical-then-digital workflows',
    ],
  },
  {
    id: 'supplies',
    name: 'Supplies',
    pitch: 'Par-level inventory for non-cannabis consumables across extraction, cultivation, and facility pools.',
    problem: 'Cannabis inventory gets tracked; consumables don’t — stockouts stop a wash or a planting.',
    value: 'Pools with QOH, par, reorder qty, and a ledger for receive / consume / adjust / waste.',
    capabilities: [
      'Extraction / cultivation / facility pools',
      'Low and out badges',
      'Tied to SOP and extraction planning gaps',
    ],
  },
  {
    id: 'team',
    name: 'Team & Roles',
    pitch: 'Invite the crew, assign roles and departments, and gate modules by who should see them.',
    problem: 'Software either shows everyone everything or builds brittle custom permissions.',
    value: 'Simple role ladder plus department scoping. Sidebar hides what you shouldn’t touch.',
    capabilities: [
      'Admin / director / department manager / technician',
      'Department-scoped module visibility',
      'Auth0 invites and trimmer roster dual-use',
    ],
  },
];

const ModuleList: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul className="fig-modules">
      {MODULES.map((mod) => {
        const open = openId === mod.id;
        const panelId = `module-panel-${mod.id}`;
        return (
          <li key={mod.id} className={`fig-module ${open ? 'is-open' : ''}`}>
            <div className="fig-module-row">
              <div className="fig-module-copy">
                <h3>{mod.name}</h3>
                <p>{mod.pitch}</p>
              </div>
              <div className="fig-module-actions">
                <button
                  type="button"
                  className="fig-text-btn"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => setOpenId(open ? null : mod.id)}
                >
                  {open ? 'Close' : 'Learn more'}
                </button>
                <a href={sandboxMail(mod.name)} className="fig-text-btn is-accent">
                  Request sandbox
                </a>
              </div>
            </div>
            {open && (
              <div id={panelId} className="fig-module-panel" role="region" aria-label={`${mod.name} details`}>
                <div className="fig-module-grid">
                  <div>
                    <p className="fig-module-kicker">Problem</p>
                    <p>{mod.problem}</p>
                  </div>
                  <div>
                    <p className="fig-module-kicker">Value</p>
                    <p>{mod.value}</p>
                  </div>
                </div>
                <p className="fig-module-kicker">Shipped today</p>
                <ul className="fig-module-caps">
                  {mod.capabilities.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <div className="fig-module-panel-cta">
                  <a href={sandboxMail(mod.name)} className="fig-cta">
                    Request sandbox access
                  </a>
                  <a href={DEMO_MAIL} className="fig-ghost">
                    Book a demo
                  </a>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

/** Meeting → floor → evidence → next-cycle plan (not N-tools consolidation). */
const COMPOUND = [
  {
    title: 'Meeting names the work',
    body: 'Standup becomes assigned floor tasks — not notes that die in a thread.',
  },
  {
    title: 'Your team handles the dirty work',
    body: 'NeuroCann handles the paperwork — moves, weigh-ins, and scouts stay on the floor; the record updates when they’re done.',
  },
  {
    title: 'Evidence plans the next cycle',
    body: 'What grew well, what ran well, and what sold well — plus early health flags — decide what you plant, process, and protect next. Dollars per plant, not gut feel.',
  },
];

const OUTCOMES = [
  {
    title: 'What grows well',
    body: 'Capture weights, rooms, and cycles so you know which genetics and environments actually pull their weight — and flag plant health early before a room takes out a harvest.',
  },
  {
    title: 'What runs well',
    body: 'Connect cultivation through processing and extraction — so washes, yields, and floor ops show which runs actually convert biomass into finished goods.',
  },
  {
    title: 'What sells well',
    body: 'Follow packages and demand so the next planting follows what moves — not guesswork about the market.',
  },
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
    body: 'Voice and chat across rooms, harvests, and packages — so what the floor finished shows up in the next cycle’s plan.',
  },
];

const LOOP = [
  {
    title: 'Say it once',
    body: 'From standup or the floor — speak the work. NeuroCann proposes the task and the system follow-through.',
  },
  {
    title: 'Your team handles the dirty work',
    body: 'NeuroCann handles the paperwork — gloves stay on, no form hunting mid-move.',
  },
  {
    title: 'Compliance writes itself',
    body: 'On complete, the system updates facility records and the METRC reporting path. You get visibility without chasing screenshots.',
  },
];

const START = [
  {
    title: 'Start with visibility',
    body: 'Connect METRC so rooms, plants, and packages match the digital state of the facility.',
  },
  {
    title: 'Orchestrate one workflow',
    body: 'Pick the pain that burns this week: harvest day, moves, labs, health flags. Conversational AI assigns and closes the loop.',
  },
  {
    title: 'Measure, plan, expand',
    body: 'Use the data you capture to plan the next cycle for dollars per plant — then grow orchestration across departments.',
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
            <a href="#modules" className="fig-link">
              Modules
            </a>
            <a href="#blog" className="fig-link">
              Blog
            </a>
            <a href="#how" className="fig-link">
              How it works
            </a>
            <button type="button" className="fig-link-btn" onClick={() => login()}>
              Sign in
            </button>
            <a href={sandboxMail()} className="fig-ghost-nav">
              Request sandbox
            </a>
            <a href={DEMO_MAIL} className="fig-cta">
              Book demo
            </a>
          </div>
        </div>
      </nav>

      {/* Hero — end goal: $ / plant + risk, enabled by ops agility */}
      <main id="main" className="fig-hero">
        <div className="fig-hero-copy">
          <p className="fig-brand">neurocann</p>
          <p className="fig-trust">Built by operators, for operators</p>
          <h1>
            Maximize <em>dollars per plant.</em>
            <br />
            Protect every harvest.
          </h1>
          <p className="fig-lede">
            Track what grows well, what runs well, and what sells well — plan the next cycle. Spot health issues early before they take out a harvest.
          </p>
          <div className="fig-hero-cta">
            <a href={DEMO_MAIL} className="fig-cta fig-cta-lg">
              Book a demo
            </a>
            <a href={sandboxMail()} className="fig-ghost">
              Request sandbox access
            </a>
            <a href="#modules" className="fig-ghost">
              Explore modules
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

      {/* Floor reality → next-cycle $ and protected harvests */}
      <section className="fig-do" aria-labelledby="fig-do-heading">
        <Reveal>
          <h2 id="fig-do-heading">
            What the floor knows should change
            <br />
            what you <em>plant next.</em>
          </h2>
          <p className="fig-do-lede">
            Meetings assign work. Operators do the physical job. NeuroCann tracks what grows well, what runs well, and what sells well — so the next cycle maximizes dollars per plant, and health risk surfaces before a room kills a harvest.
          </p>
        </Reveal>
        <ol className="fig-compound" aria-label="How floor work compounds into planning">
          {COMPOUND.map((step, i) => (
            <Reveal key={step.title} delay={i * 70}>
              <li>
                <span className="fig-compound-n" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="fig-band" aria-labelledby="fig-outcome-heading">
        <Reveal>
          <h2 id="fig-outcome-heading">
            Square footage is fixed.
            <br />
            <span>Output and risk aren’t.</span>
          </h2>
          <p className="fig-section-lede">
            Agility in operations so you can track what grows well, what runs well, and what sells well — then protect every cycle and maximize revenue per plant.
          </p>
        </Reveal>
        <ul className="fig-split">
          {OUTCOMES.map((item, i) => (
            <Reveal key={item.title} delay={i * 70}>
              <li>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="fig-band fig-band-alt" aria-labelledby="fig-orch-heading">
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

      <section id="how" className="fig-band" aria-labelledby="fig-loop-heading">
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

      <section className="fig-band fig-band-alt" aria-labelledby="fig-start-heading">
        <Reveal>
          <h2 id="fig-start-heading">
            Start with one workflow.
            <br />
            <span>Expand into measurement and planning.</span>
          </h2>
          <p className="fig-section-lede">
            Begin with METRC sync for instant visibility — then grow orchestration until the facility’s data can drive the next planting and protect the next harvest.
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

      <section id="modules" className="fig-band fig-band-alt" aria-labelledby="fig-modules-heading">
        <Reveal>
          <h2 id="fig-modules-heading">
            Modules that run the facility —
            <br />
            <span>from voice on the floor.</span>
          </h2>
          <p className="fig-section-lede">
            Seed-to-sale coverage you can speak into. Open any module for the problem it solves, the value, and what’s shipped today — then request a sandbox to try it.
          </p>
        </Reveal>
        <ModuleList />
        <div className="fig-modules-foot">
          <a href={sandboxMail()} className="fig-cta fig-cta-lg">
            Request sandbox access
          </a>
          <a href={DEMO_MAIL} className="fig-ghost">
            Book a working demo
          </a>
        </div>
      </section>

      <section className="fig-hub" aria-labelledby="fig-hub-heading">
        <Reveal>
          <h2 id="fig-hub-heading">
            METRC stays the reporting path.
            <br />
            <span>NeuroCann stays where operators work.</span>
          </h2>
          <p className="fig-hub-note">
            Sync the digital state of the facility, then expand into accounting, sensors, labs, and SSO as you need them.{' '}
            <a href="mailto:will@neurocann.app?subject=NeuroCann%20Integration%20Request">
              Request an integration →
            </a>
          </p>
        </Reveal>
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

      <section id="blog" className="fig-band" aria-labelledby="fig-blog-heading">
        <Reveal>
          <h2 id="fig-blog-heading">
            From the floor.
            <br />
            <span>Notes on ops, yield, and risk.</span>
          </h2>
          <p className="fig-section-lede">
            Short reads for managers who care about dollars per plant — not another generic SaaS newsletter.
          </p>
        </Reveal>
        <ul className="fig-blog">
          {BLOG_POSTS.map((post, i) => (
            <Reveal key={post.slug} delay={i * 60}>
              <li>
                <article>
                  <time dateTime={post.date}>
                    {new Date(post.date + 'T12:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </time>
                  <h3>
                    <a href={`mailto:will@neurocann.app?subject=${encodeURIComponent(`Blog: ${post.title}`)}`}>
                      {post.title}
                    </a>
                  </h3>
                  <p>{post.excerpt}</p>
                  <a
                    className="fig-text-btn"
                    href={`mailto:will@neurocann.app?subject=${encodeURIComponent(`Blog: ${post.title}`)}`}
                  >
                    Request the full piece →
                  </a>
                </article>
              </li>
            </Reveal>
          ))}
        </ul>
      </section>

      <section id="list" className="fig-band fig-band-alt" aria-labelledby="fig-list-heading">
        <Reveal>
          <h2 id="fig-list-heading">
            Get facility ops notes.
            <br />
            <span>No spam. Unsubscribe anytime.</span>
          </h2>
          <p className="fig-section-lede">
            New posts, product drops, and demo invites — for people running rooms, harvests, and extraction floors.
          </p>
        </Reveal>
        <MailingListForm />
      </section>

      <section className="fig-close" aria-labelledby="fig-close-heading">
        <Reveal>
          <h2 id="fig-close-heading">
            See the facility clearly —
            <br />
            then maximize every plant.
          </h2>
          <p>
            Book a working session. We’ll map one workflow, show METRC-backed visibility, and leave you with a path to measure, plan, and protect harvests.
          </p>
          <div className="fig-hero-cta is-center">
            <a href={sandboxMail()} className="fig-cta fig-cta-lg">
              Request sandbox access
            </a>
            <a href={DEMO_MAIL} className="fig-ghost">
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
        .fig-ghost-nav {
          display: none;
          align-items: center;
          justify-content: center;
          background: var(--white);
          color: var(--panther);
          text-decoration: none;
          font-size: 0.8125rem;
          font-weight: 700;
          padding: 0.55rem 0.85rem;
          border-radius: 0.5rem;
          border: 1.5px solid var(--dolphin);
          min-height: 44px;
          transition: border-color 0.15s;
        }
        .fig-ghost-nav:hover { border-color: var(--panther); }
        @media (min-width: 900px) {
          .fig-ghost-nav { display: inline-flex; }
        }

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
          height: min(68vh, 580px);
          min-height: 460px;
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
          max-width: min(95%, 28rem);
        }
        .fig-msg.is-ai.is-structured {
          max-width: 100%;
          width: 100%;
          padding: 0.85rem 1rem;
        }
        .fig-msg.is-ai .fig-md,
        .fig-msg.is-ai .ai-msg-bubble-assistant {
          background: transparent;
          padding: 0;
          margin: 0;
          max-width: none;
          border-radius: 0;
          color: inherit;
          font-size: inherit;
          line-height: inherit;
        }
        .fig-msg.is-ai .fig-md p {
          margin: 0 0 0.55rem;
        }
        .fig-msg.is-ai .fig-md p:last-child {
          margin-bottom: 0;
        }
        .fig-msg.is-ai .fig-md strong {
          font-weight: 900;
        }
        .fig-msg.is-ai .fig-md table {
          display: block;
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
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
        .fig-mic.is-live {
          color: var(--chameleon-ink);
          background: var(--chameleon);
          border-radius: 0.45rem;
        }
        .fig-composer.is-listening {
          background: rgba(47, 158, 95, 0.12);
        }
        .fig-composer-placeholder.is-live {
          color: #1a5c38;
          font-weight: 700;
        }

        /* Standup visual story */
        .fig-listen {
          margin: auto;
          text-align: center;
          padding: 1.5rem 1rem;
          max-width: 18rem;
        }
        .fig-listen-mic {
          position: relative;
          width: 3.5rem;
          height: 3.5rem;
          margin: 0 auto 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--chameleon-ink);
          background: var(--chameleon);
          border-radius: 50%;
        }
        .fig-listen-ring {
          position: absolute;
          inset: -6px;
          border: 2px solid rgba(47, 158, 95, 0.45);
          border-radius: 50%;
          animation: figRing 1.6s ease-out infinite;
        }
        .fig-listen-ring.is-delay { animation-delay: 0.55s; }
        .fig-listen-title {
          margin: 0 0 0.25rem;
          font-weight: 900;
          font-size: 0.95rem;
          letter-spacing: -0.02em;
        }
        .fig-listen-sub {
          margin: 0 0 1rem;
          color: var(--rhino);
          font-size: 0.8rem;
        }
        .fig-wave {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 3px;
          height: 1.5rem;
        }
        .fig-wave i {
          display: block;
          width: 3px;
          height: 40%;
          background: var(--chameleon);
          border-radius: 1px;
          animation: figWave 0.9s ease-in-out infinite;
        }
        .fig-assemble {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .fig-assemble-label {
          margin: 0;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--chameleon);
        }
        .fig-assemble-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .fig-assemble-card {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          padding: 0.75rem 0.85rem;
          background: var(--koala);
          border-radius: 0.65rem;
          animation: figIn 0.4s cubic-bezier(0.16,1,0.3,1);
        }
        .fig-assemble-card.is-skeleton {
          min-height: 3.25rem;
          justify-content: center;
          opacity: 0.7;
        }
        .fig-assemble-title {
          font-size: 0.875rem;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .fig-assemble-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          align-items: center;
        }
        .fig-chip {
          display: inline-flex;
          align-items: center;
          padding: 0.15rem 0.5rem;
          border-radius: 0.35rem;
          font-size: 0.6875rem;
          font-weight: 700;
          background: var(--white);
          color: var(--rhino);
        }
        .fig-chip.is-person {
          color: var(--panther);
          background: var(--white);
        }
        .fig-skel {
          display: block;
          height: 0.55rem;
          width: 70%;
          background: rgba(26, 26, 26, 0.08);
          border-radius: 0.25rem;
          margin-bottom: 0.35rem;
          animation: figPulse 1.2s ease-out infinite;
        }
        .fig-skel.is-short { width: 40%; margin-bottom: 0; }

        @keyframes figRing {
          0% { transform: scale(0.9); opacity: 0.7; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        @keyframes figWave {
          0%, 100% { height: 30%; }
          50% { height: 100%; }
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

        /* Floor → next-cycle compounding */
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
        .fig-compound {
          list-style: none;
          margin: 0 auto;
          padding: 0;
          display: grid;
          gap: 1.75rem;
          text-align: left;
          max-width: 56rem;
        }
        @media (min-width: 800px) {
          .fig-compound {
            grid-template-columns: repeat(3, 1fr);
            gap: 2rem;
          }
        }
        .fig-compound li {
          margin: 0;
          padding: 0;
        }
        .fig-compound-n {
          display: block;
          margin-bottom: 0.55rem;
          font-size: 0.75rem;
          font-weight: 900;
          letter-spacing: 0.1em;
          color: var(--chameleon);
        }
        .fig-compound h3 {
          margin: 0 0 0.45rem;
          font-size: 1.1rem;
          font-weight: 900;
          letter-spacing: -0.02em;
          color: var(--panther);
        }
        .fig-compound p {
          margin: 0;
          color: var(--rhino);
          font-size: 0.95rem;
          line-height: 1.5;
        }

        /* Integration note */
        .fig-hub {
          max-width: 1200px;
          margin: 0 auto;
          padding: 4.5rem 1.5rem;
          border-top: 1px solid var(--line);
          text-align: center;
        }
        .fig-hub h2 {
          margin: 0 auto 1.25rem;
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
        .fig-hub-note {
          margin: 0 auto;
          max-width: 32rem;
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

        /* Module index — learn more expanders */
        .fig-modules {
          list-style: none;
          margin: 0;
          padding: 0;
          border-top: 1px solid var(--line);
        }
        .fig-module {
          border-bottom: 1px solid var(--line);
        }
        .fig-module-row {
          display: grid;
          gap: 1rem;
          padding: 1.35rem 0;
        }
        @media (min-width: 800px) {
          .fig-module-row {
            grid-template-columns: 1fr auto;
            align-items: start;
            gap: 1.5rem;
          }
        }
        .fig-module-copy h3 {
          margin: 0 0 0.35rem;
          font-size: 1.1rem;
          font-weight: 900;
          letter-spacing: -0.02em;
        }
        .fig-module-copy p {
          margin: 0;
          color: var(--rhino);
          font-size: 0.95rem;
          line-height: 1.5;
          max-width: 40rem;
        }
        .fig-module-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem 1rem;
          align-items: center;
        }
        .fig-text-btn {
          background: none;
          border: none;
          font: inherit;
          font-size: 0.875rem;
          font-weight: 700;
          color: var(--panther);
          text-decoration: underline;
          text-underline-offset: 3px;
          cursor: pointer;
          padding: 0.5rem 0;
          min-height: 44px;
        }
        .fig-text-btn.is-accent { color: #1a5c38; }
        .fig-text-btn:hover { color: var(--chameleon); }
        a.fig-text-btn {
          display: inline-flex;
          align-items: center;
        }
        .fig-module-panel {
          padding: 0 0 1.5rem;
          animation: figIn 0.35s cubic-bezier(0.16,1,0.3,1);
        }
        .fig-module-grid {
          display: grid;
          gap: 1.25rem;
          margin-bottom: 1.25rem;
        }
        @media (min-width: 720px) {
          .fig-module-grid { grid-template-columns: 1fr 1fr; gap: 1.75rem; }
        }
        .fig-module-kicker {
          margin: 0 0 0.35rem;
          font-size: 0.7rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--dolphin);
        }
        .fig-module-grid p:not(.fig-module-kicker),
        .fig-module-panel > p:not(.fig-module-kicker) {
          margin: 0;
          color: var(--rhino);
          font-size: 0.95rem;
          line-height: 1.5;
        }
        .fig-module-caps {
          list-style: none;
          margin: 0 0 1.25rem;
          padding: 0;
        }
        .fig-module-caps li {
          position: relative;
          padding: 0.4rem 0 0.4rem 1rem;
          color: var(--panther);
          font-size: 0.95rem;
          font-weight: 700;
          line-height: 1.4;
          border-bottom: 1px solid var(--line);
        }
        .fig-module-caps li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0.85rem;
          width: 0.35rem;
          height: 0.35rem;
          background: var(--chameleon);
          border-radius: 1px;
        }
        .fig-module-panel-cta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.65rem;
        }
        .fig-modules-foot {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin-top: 2rem;
        }

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

        .fig-blog {
          list-style: none;
          margin: 0;
          padding: 0;
          border-top: 1px solid var(--line);
        }
        .fig-blog li {
          padding: 1.5rem 0;
          border-bottom: 1px solid var(--line);
        }
        .fig-blog time {
          display: block;
          margin-bottom: 0.45rem;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--dolphin);
        }
        .fig-blog h3 {
          margin: 0 0 0.45rem;
          font-size: clamp(1.15rem, 2.4vw, 1.4rem);
          font-weight: 900;
          letter-spacing: -0.025em;
          line-height: 1.25;
          max-width: 36rem;
        }
        .fig-blog h3 a {
          color: var(--panther);
          text-decoration: none;
        }
        .fig-blog h3 a:hover { color: var(--chameleon); }
        .fig-blog p {
          margin: 0 0 0.65rem;
          max-width: 38rem;
          color: var(--rhino);
          font-size: 1rem;
          line-height: 1.55;
        }

        .fig-mail {
          display: flex;
          flex-wrap: wrap;
          gap: 0.65rem;
          align-items: center;
          max-width: 32rem;
        }
        .fig-mail input {
          flex: 1 1 14rem;
          min-height: 44px;
          padding: 0.7rem 0.9rem;
          border: 1.5px solid var(--dolphin);
          border-radius: 0.5rem;
          font: inherit;
          font-size: 0.95rem;
          background: var(--white);
          color: var(--panther);
        }
        .fig-mail input:focus {
          outline: 3px solid var(--focus);
          outline-offset: 2px;
          border-color: var(--panther);
        }
        .fig-mail input[aria-invalid='true'] {
          border-color: #b42318;
        }
        .fig-mail-status {
          flex: 1 1 100%;
          margin: 0;
          min-height: 1.25rem;
          font-size: 0.875rem;
          font-weight: 700;
          color: var(--rhino);
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
          .fig-caret,
          .fig-listen-ring,
          .fig-wave i,
          .fig-assemble-card,
          .fig-skel {
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
