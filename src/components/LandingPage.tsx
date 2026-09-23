import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/authContext';
import { ActionPreview } from './ActionPreview';
import type { ProposedAction } from '../types/definitions';
import logo from '../assets/logo.png';

/* ─── Scroll-reveal ─── */
function useReveal<T extends HTMLElement>(threshold = 0.15) {
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
        transform: visible ? 'none' : 'translateY(28px)',
        transition: `opacity 0.75s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.75s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

/* ─── Logo ─── */
const NeurocannLogo: React.FC<{ className?: string; stroke?: string }> = ({
  className = '',
  stroke = '#3BB570',
}) => (
  <svg className={className} viewBox="0 0 203 197" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M97.895 15.5746C97.895 35.3094 97.895 55.0441 97.895 74.7788C97.895 77.7632 97.6282 79.4534 95.2441 82.0689C91.9138 85.7224 82.7503 83.2156 82.7503 84.1062C82.7503 84.9968 87.3022 85.3591 89.8318 86.929C94.3154 89.7116 97.4998 93.4534 98.8154 97.9534C99.4001 99.9534 100.177 105.505 99.3154 108.953C98.4533 112.402 96.7459 114.442 93.8154 116.453C89.8927 119.146 81.8154 118.453 81.8154 118.453" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M81.8154 118.453C81.8154 118.453 87.2604 119.329 90.3154 120.953C95.2595 123.582 98.2182 126.857 99.3154 132.453C99.6775 134.301 100.296 139.232 97.8154 142.953C95.8154 145.953 93.4985 146.815 89.9422 148.121C86.6062 149.347 79.1047 149.005 80.8848 149.005C82.665 149.005 85.5815 149.718 88.3154 150.953C91.8744 152.561 93.9566 153.841 96.3154 156.953C98.231 159.481 99.3367 161.6 100.315 164.953C101.337 168.453 102.104 172.443 100.815 176.953C99.8154 180.453 98.1036 185.411 93.8154 188.453C88.7727 192.03 82.3154 193.578 77.8154 192.453C74.595 191.648 72.8154 190.953 71.3154 188.953C69.8154 186.953 69.3154 179.453 68.8154 179.453C68.3154 179.453 67.0266 182.794 65.3154 184.453C63.4876 186.226 62.2194 187.325 59.8154 188.453C57.5815 189.502 55.9492 190.112 53.3154 190.453C49.6401 190.929 47.2653 190.807 43.8154 189.453C39.323 187.691 37.0768 185.441 34.3154 181.453C32.8239 179.3 31.0376 176.206 31.3154 175.453C31.8154 174.098 35.2372 174.152 37.8154 172.953C40.6151 171.652 42.4388 171.019 44.8154 168.953C47.2327 166.853 49.8154 162.453 49.8154 162.453C49.8154 162.453 52.6197 157.784 52.8154 154.453C52.9477 152.201 52.2064 148.586 52.3154 148.453C52.4244 148.321 55.4314 149.703 57.3154 149.953C60.8021 150.418 62.9064 149.431 65.8154 147.453C69.7389 144.786 71.3154 141.953 72.3154 136.953" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M32.8154 174.453C32.8154 174.453 30.3154 175.953 21.8154 171.453C19.1478 170.041 17.7435 168.503 15.8265 166.567C12.0436 162.748 10.5211 159.325 10.3154 153.953C10.1175 148.785 11.4725 146.174 14.4888 141.384C15.8117 139.282 18.6357 136.614 18.5879 136.524C18.5401 136.433 16.3325 137.427 14.8154 137.453C11.4964 137.512 9.66297 136.345 7.31538 133.453C4.84166 130.407 3.92694 127.453 3.31538 123.953C2.70381 120.453 2.87033 114.953 4.81538 110.953C6.546 107.394 8.99198 105.252 11.9606 103.767C16.5824 101.456 22.2419 100.846 27.3753 100.846C29.4562 100.846 32.7196 101.344 34.3217 102.785C36.4133 104.668 39.7273 107.032 38.9117 107.032" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M12.8154 102.953C9.78976 100.669 8.36508 98.5965 7.31537 94.9534C6.3963 91.7637 6.58685 89.6919 7.31537 86.4534C8.02473 83.3 8.85277 81.4907 10.8154 78.9534C12.9382 76.2089 14.405 75.0617 17.3154 73.4534C20.0176 71.9601 21.94 71.2006 24.8154 70.9534C28.923 70.6002 30.8204 72.9561 34.3154 74.9533C37.8154 76.9534 40.542 77.7081 44.3154 76.9534C46.5445 76.5075 49.5155 74.337 49.5155 74.337" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M28.5 71.5C25.8951 69.637 21.9479 67.449 20.8154 64.4534C18.6575 58.7458 19.7593 50.919 23.5 46.5C26 43.5466 30.3162 40.2697 34.5 40C37.2899 39.8202 39.5558 39.9768 41.5 41.5C43.6353 43.173 44.1309 45.8271 45.8154 47.9534C47.1872 49.685 49.8154 51.9534 49.8154 51.9534" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M42.3154 41.9534C42.3154 41.9534 40.9628 38.6762 40.679 36.4534C40.4565 34.7101 40.433 33.6934 40.679 31.9534C41.1234 28.8099 41.9906 27.0513 43.8154 24.4534C45.6424 21.8522 46.9426 20.6278 49.8154 18.9534C52.0084 17.6751 53.6449 16.9682 56.3154 16.4534C59.1913 15.8989 63.8154 16.4534 63.8154 16.4534" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M63.8154 15.9534C61.9513 22.0718 63.0669 27.172 67.3154 31.9534C70.39 35.4137 72.8154 37.4534 77.8154 37.4534" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M63.8154 16.4533C63.8154 16.4533 66.3235 12.247 68.5138 10.0518C70.8154 7.74512 73.3406 5.25247 77.3154 3.95336C80.4386 2.93257 83.1961 2.81869 85.6958 3.20357C89.6646 3.81464 92.256 4.85913 94.8154 7.95333C96.826 10.3841 97.9655 13.898 97.8154 15.4533" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M57.8154 58.9534C60.4767 59.8282 61.7362 60.711 63.8154 62.4534C65.6175 63.9636 66.6233 64.9267 67.8154 66.9534C69.8345 70.3861 70.4272 72.9295 70.3154 76.9534C70.226 80.1725 69.5651 82.0644 68.3154 84.9534C66.8324 88.3815 65.1653 89.7531 62.3154 91.9534C60.0333 93.7152 55.8154 95.4534 55.8154 95.4534" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M69.8154 69.4534C71.6109 70.4509 74.2271 70.3329 76.8154 69.4534C79.7033 68.472 81.4799 66.7261 83.3154 63.9534C85.0196 61.379 85.6341 59.5354 85.8154 56.4534" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M59.8154 120.453C56.1054 120.258 53.602 119.488 50.3154 119.953C46.4633 120.499 44.7303 121.358 41.8154 123.453C39.2344 125.309 37.9551 126.730 36.3154 129.453C34.7092 132.121 34.0414 133.870 33.6099 136.953C33.1482 140.252 33.3162 142.276 34.3154 145.453" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M106.815 7.45337C106.815 7.45337 109.269 10.5973 110.315 12.4534C115.007 20.7737 117.815 35.9534 117.815 35.9534C117.815 35.9534 120.508 50.1066 121.533 58.9534C122.628 68.411 123.079 83.284 123.079 83.284C123.079 83.284 123.203 94.6089 122.858 101.853C122.548 108.349 122.435 111.979 121.815 118.453C120.898 128.045 120.635 132.453 118.612 142.953C117.164 150.468 116.016 155.813 113.815 161.953C111.626 168.063 107.394 177.282 107.394 177.282" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M123.315 109.453C123.315 109.453 127.481 103.587 130.315 99.9534C134.406 94.71 141.315 86.9534 141.315 86.9534C141.315 86.9534 148.527 80.135 153.315 75.9534C157.91 71.9408 165.315 65.9534 165.315 65.9534" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M165.315 65.9534C165.315 65.9534 164.612 75.7369 163.815 81.9534C163.211 86.6657 162.862 89.3191 161.815 93.9534C160.604 99.3169 159.637 102.265 157.815 107.453C155.64 113.646 154.117 117.018 151.315 122.953C148.295 129.352 146.602 132.977 142.815 138.953C138.049 146.476 134.996 150.542 128.815 156.953C122.465 163.541 118.44 167.895 110.815 172.953" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M146.315 133.453L157.815 126.453C157.815 126.453 164.391 122.823 168.815 120.953C175.414 118.165 179.313 116.965 186.315 115.453C191.714 114.288 200.315 113.453 200.315 113.453" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M200.315 113.453C200.315 113.453 195.689 121.539 192.315 126.453C187.363 133.669 184.464 137.725 178.315 143.953C172.765 149.576 169.341 152.501 162.815 156.953C155.168 162.171 150.393 164.470 141.815 167.953C135.350 170.579 131.705 172.348 124.815 173.453C119.221 174.351 115.958 174.464 110.315 173.953" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M151 164C151 164 164.954 160.54 174 161C179.056 161.257 181.926 161.641 186.815 162.953C190.215 163.866 191.996 164.782 195.315 165.953" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M195.315 165.953C193.005 167.374 191.690 168.141 189.315 169.453C185.112 171.776 182.747 173.102 178.315 174.953C172.275 177.476 168.717 178.586 162.315 179.953C155.019 181.511 143.315 181.953 143.315 181.953C143.315 181.953 134.435 181.916 128.815 181.151C123.070 180.369 114.315 177.953 114.315 177.953" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M112.5 177.5C112.5 177.5 119.113 180.160 121.815 181.953C124.148 183.501 126 184.502 127.815 186.953C129.585 189.343 130.305 191.023 130.815 193.953" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M130.815 193.953C126.793 193.788 124.442 193.200 120.815 191.453C117.543 189.877 113.315 185.953 113.315 185.953C113.315 185.953 110.595 183.426 109.315 181.453C108.365 179.988 107.315 177.453 107.315 177.453" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
  </svg>
);

/* ─── Demo conversation data ─── */
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
      { type: 'pause', ms: 2000 },
      { type: 'confirmed' },
      { type: 'pause', ms: 2200 },
    ],
  },
  {
    label: 'Weigh + flag',
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
      { type: 'pause', ms: 2000 },
      { type: 'confirmed' },
      { type: 'pause', ms: 2200 },
    ],
  },
  {
    label: 'Start extraction',
    prompt: 'Start a rosin press run with 2kg of Wedding Cake bubble hash',
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
      { type: 'pause', ms: 2000 },
      { type: 'confirmed' },
      { type: 'pause', ms: 2200 },
    ],
  },
  {
    label: 'Order supplies',
    prompt: 'Create a PO for Pacific Roots — 10 cases of rockwool',
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
      { type: 'pause', ms: 2000 },
      { type: 'confirmed' },
      { type: 'pause', ms: 2200 },
    ],
  },
  {
    label: 'Package flower',
    prompt: 'Create a 1lb Gelato package, tag METRC-001234',
    steps: [
      { type: 'user', text: 'Create a 1lb flower package from the Gelato harvest, tag it METRC-001234' },
      { type: 'ai', text: 'Creating the package and assigning the tag.' },
      {
        type: 'actions',
        actions: [
          { type: 'create_package', data: { strain: 'Gelato', packageType: 'flower', weight: 453.6, harvestName: 'Gelato Harvest #2' } },
          { type: 'assign_tag', data: { tagId: '1A40-METRC-001234', target: 'package' } },
        ],
      },
      { type: 'pause', ms: 2000 },
      { type: 'confirmed' },
      { type: 'pause', ms: 2200 },
    ],
  },
];

const AIChatDemo: React.FC<{
  scenarioIndex: number;
  onScenarioComplete: () => void;
  autoplay: boolean;
}> = ({ scenarioIndex, onScenarioComplete, autoplay }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [typingText, setTypingText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([]);
  const [pendingActions, setPendingActions] = useState<ProposedAction[] | null>(null);
  const [actionStatus, setActionStatus] = useState<'confirmed' | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const runId = useRef(0);

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
    if (!autoplay) return;
    const thisRun = runId.current;
    const steps = scenario.steps;

    if (stepIndex >= steps.length) {
      const timeout = setTimeout(() => {
        if (runId.current === thisRun) onScenarioComplete();
      }, 400);
      return () => clearTimeout(timeout);
    }

    const step = steps[stepIndex];

    if (step.type === 'user' || step.type === 'ai') {
      setIsTyping(true);
      let charIndex = 0;
      const speed = step.type === 'user' ? 28 : 16;
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
          setMessages((prev) => [...prev, { role: step.type as 'user' | 'ai', text: step.text }]);
          setTypingText('');
          setTimeout(() => {
            if (runId.current === thisRun) setStepIndex((s) => s + 1);
          }, 350);
        }
      }, speed);
      return () => clearInterval(typeInterval);
    }

    if (step.type === 'actions') {
      const timeout = setTimeout(() => {
        if (runId.current !== thisRun) return;
        setPendingActions(step.actions);
        setActionStatus(undefined);
        setStepIndex((s) => s + 1);
      }, 280);
      return () => clearTimeout(timeout);
    }

    if (step.type === 'confirmed') {
      setActionStatus('confirmed');
      setTimeout(() => {
        if (runId.current === thisRun) setStepIndex((s) => s + 1);
      }, 80);
      return;
    }

    if (step.type === 'pause') {
      const timeout = setTimeout(() => {
        if (runId.current === thisRun) setStepIndex((s) => s + 1);
      }, step.ms);
      return () => clearTimeout(timeout);
    }
  }, [stepIndex, scenario, autoplay, onScenarioComplete]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, typingText, pendingActions, actionStatus]);

  const currentStep = stepIndex < scenario.steps.length ? scenario.steps[stepIndex] : null;
  const typingRole =
    currentStep && (currentStep.type === 'user' || currentStep.type === 'ai') ? currentStep.type : null;

  return (
    <div className="landing-demo">
      <div className="landing-demo-chrome">
        <div className="landing-demo-dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="landing-demo-title">
          <img src={logo} alt="" className="landing-demo-logo" />
          <span>neurocann</span>
          <span className="landing-demo-path">/ facility · live</span>
        </div>
        <div className="landing-demo-status">
          <span className="landing-pulse" />
          Online
        </div>
      </div>

      <div ref={containerRef} className="landing-demo-body scrollbar-hide">
        {messages.map((msg, i) => (
          <div key={i} className={`landing-bubble-row ${msg.role === 'user' ? 'is-user' : 'is-ai'}`}>
            <div className={`landing-bubble ${msg.role === 'user' ? 'is-user' : 'is-ai'}`}>{msg.text}</div>
          </div>
        ))}

        {typingRole && typingText && (
          <div className={`landing-bubble-row ${typingRole === 'user' ? 'is-user' : 'is-ai'}`}>
            <div className={`landing-bubble ${typingRole === 'user' ? 'is-user' : 'is-ai'}`}>
              {typingText}
              {isTyping && <span className="landing-caret" />}
            </div>
          </div>
        )}

        {typingRole && !typingText && (
          <div className={`landing-bubble-row ${typingRole === 'user' ? 'is-user' : 'is-ai'}`}>
            <div className={`landing-bubble landing-typing ${typingRole === 'user' ? 'is-user' : 'is-ai'}`}>
              <span /><span /><span />
            </div>
          </div>
        )}

        {pendingActions && (
          <div className="landing-demo-actions">
            <ActionPreview
              actions={pendingActions}
              readonly={actionStatus === 'confirmed'}
              status={actionStatus}
              {...(!actionStatus && {
                onConfirm: () => {},
                onCancel: () => {},
              })}
            />
          </div>
        )}
      </div>

      <div className="landing-demo-input">
        <svg className="landing-mic" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
        <span>Talk or type a command…</span>
      </div>
    </div>
  );
};

const MODULES = [
  {
    name: 'Cultivation',
    line: 'Every room, every plant, every phase — mapped and healthy.',
  },
  {
    name: 'Harvest',
    line: 'Weigh, allocate, submit. Voice-ready for gloves-on days.',
  },
  {
    name: 'Trim',
    line: 'Flower, shake, waste — every gram in the right bucket.',
  },
  {
    name: 'Extraction',
    line: 'Fresh frozen → bubble → rosin → carts, with yields that stick.',
  },
  {
    name: 'Packages',
    line: 'Tags, labs, holds. Compliance that writes itself as you work.',
  },
  {
    name: 'Ordering',
    line: 'Vendor catalogs to multi-store POs — spoken into existence.',
  },
];

const STEPS = [
  {
    num: '01',
    title: 'Say it',
    body: 'Speak or type like you’d tell a floor lead. No forms. No hunting through menus.',
  },
  {
    num: '02',
    title: 'Check it',
    body: 'NeuroCann proposes exactly what it’ll do. You see every detail before anything changes.',
  },
  {
    num: '03',
    title: 'Ship it',
    body: 'Confirm once. Plant map, harvest logs, trim, packages, and compliance all update together.',
  },
];

export const LandingPage: React.FC = () => {
  const { login } = useAuth();
  const [scrollY, setScrollY] = useState(0);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(true);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navSolid = scrollY > 24;

  const pickScenario = (index: number) => {
    setAutoplay(true);
    setScenarioIndex(index);
  };

  const advanceScenario = () => {
    setScenarioIndex((s) => (s + 1) % DEMO_SCENARIOS.length);
  };

  return (
    <div className="landing">
      {/* ── Nav ── */}
      <nav className={`landing-nav ${navSolid ? 'is-solid' : ''}`}>
        <div className="landing-nav-inner">
          <a href="#" className="landing-brand" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <NeurocannLogo className="landing-brand-mark" stroke="#2F9E5F" />
            <span className="landing-brand-word">
              neuro<span>cann</span>
            </span>
          </a>
          <div className="landing-nav-actions">
            <a href="#platform" className="landing-nav-link">Platform</a>
            <a href="#how" className="landing-nav-link">How it works</a>
            <button type="button" onClick={() => login()} className="landing-nav-ghost">
              Sign in
            </button>
            <a
              href="mailto:will@neurocann.app?subject=NeuroCann%20Demo%20Request"
              className="landing-nav-cta"
            >
              Book demo
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero: one composition ── */}
      <header className="landing-hero">
        <div className="landing-hero-atmosphere" aria-hidden>
          <div className="landing-orb landing-orb-a" />
          <div className="landing-orb landing-orb-b" />
          <div className="landing-orb landing-orb-c" />
          <div className="landing-leaf-mesh" />
        </div>

        <div className="landing-hero-copy">
          <p className="landing-brand-hero" style={{ animationDelay: '0.05s' }}>
            neurocann
          </p>
          <h1 style={{ animationDelay: '0.18s' }}>
            Talk to your
            <br />
            <em>facility.</em>
          </h1>
          <p className="landing-lede" style={{ animationDelay: '0.32s' }}>
            Cultivation through compliance — one conversational interface. Voice-first. Hands-free. Built by operators.
          </p>
          <div className="landing-cta-row" style={{ animationDelay: '0.45s' }}>
            <a
              href="mailto:will@neurocann.app?subject=NeuroCann%20Demo%20Request"
              className="landing-btn-primary"
            >
              Book a demo
              <span aria-hidden>→</span>
            </a>
            <a href="#demo" className="landing-btn-secondary">
              Watch it work
            </a>
          </div>
        </div>

        <div className="landing-hero-visual" id="demo" style={{ animationDelay: '0.25s' }}>
          <AIChatDemo
            scenarioIndex={scenarioIndex}
            onScenarioComplete={advanceScenario}
            autoplay={autoplay}
          />
        </div>
      </header>

      {/* ── Try a command (interaction) ── */}
      <section className="landing-try" aria-label="Try a command">
        <div className="landing-try-inner">
          <p className="landing-try-label">Try a command</p>
          <div className="landing-try-row">
            {DEMO_SCENARIOS.map((s, i) => (
              <button
                key={s.label}
                type="button"
                className={`landing-try-chip ${i === scenarioIndex ? 'is-active' : ''}`}
                onClick={() => pickScenario(i)}
              >
                {s.prompt}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform modules: one job ── */}
      <section id="platform" className="landing-modules">
        <Reveal>
          <h2>
            Seed to sale,
            <br />
            <span>without the spreadsheet circus.</span>
          </h2>
          <p className="landing-section-lede">
            Eight operational modules. One AI that already knows your rooms, strains, and SOPs.
          </p>
        </Reveal>
        <ul className="landing-module-list">
          {MODULES.map((m, i) => (
            <li key={m.name}>
              <Reveal delay={i * 70}>
                <span className="landing-module-name">{m.name}</span>
                <span className="landing-module-line">{m.line}</span>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Ambient ── */}
      <section className="landing-ambient">
        <div className="landing-ambient-glow" aria-hidden />
        <Reveal>
          <p className="landing-kicker">Ambient voice</p>
          <h2>
            Always listening.
            <br />
            <span>Never in the way.</span>
          </h2>
          <p className="landing-section-lede">
            Keep working. NeuroCann captures weights, flags, and tasks in the background — then queues actions for your review.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div className="landing-ambient-stream" aria-hidden>
            {[
              { t: '2:14', line: 'plant seven came in at five twelve, little PM on the lower fans' },
              { t: '2:17', line: 'plant eight is four seventy eight, looks clean' },
              { t: '2:19', line: "that's batch one done — taking a fifteen" },
              { t: '2:34', line: 'order forty cases of rockwool from pacific for next week' },
            ].map((u, i) => (
              <div key={u.t} className="landing-utterance" style={{ animationDelay: `${0.15 * i}s` }}>
                <time>{u.t}</time>
                <p>“{u.line}”</p>
              </div>
            ))}
            <div className="landing-listening">
              <span className="landing-wave" aria-hidden>
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <i key={i} style={{ animationDelay: `${i * 0.08}s` }} />
                ))}
              </span>
              Capturing…
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="landing-how">
        <Reveal>
          <p className="landing-kicker">How it works</p>
          <h2>
            Three steps.
            <br />
            Zero clipboard archaeology.
          </h2>
        </Reveal>
        <ol className="landing-steps">
          {STEPS.map((step, i) => (
            <Reveal key={step.num} delay={i * 100}>
              <li>
                <span className="landing-step-num">{step.num}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ── Shameless CTA (PostHog energy) ── */}
      <section className="landing-close">
        <Reveal>
          <NeurocannLogo className="landing-close-mark" stroke="#3BB570" />
          <h2>
            Still reading?
            <br />
            <em>Your plants aren’t.</em>
          </h2>
          <p>
            Grown from necessity. Cultivated for cannabis. Book fifteen minutes and we’ll put NeuroCann on your next harvest day.
          </p>
          <div className="landing-cta-row is-center">
            <a
              href="mailto:will@neurocann.app?subject=NeuroCann%20Demo%20Request"
              className="landing-btn-primary"
            >
              Book a demo
              <span aria-hidden>→</span>
            </a>
            <button type="button" onClick={() => login()} className="landing-btn-ghost">
              Sign in
            </button>
          </div>
        </Reveal>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-brand is-muted">
            <NeurocannLogo className="landing-brand-mark" stroke="#5a7a66" />
            <span className="landing-brand-word">
              neuro<span>cann</span>
            </span>
          </div>
          <p>© {new Date().getFullYear()} NeuroCann. All rights reserved.</p>
        </div>
      </footer>

      <style>{`
        .landing {
          --ink: #0e1c14;
          --ink-soft: #2a4034;
          --moss: #1b3a28;
          --leaf: #2f9e5f;
          --glow: #3bb570;
          --glow-soft: rgba(59, 181, 112, 0.18);
          --amber: #d4a017;
          --amber-soft: rgba(212, 160, 23, 0.14);
          --paper: #eef5f0;
          --paper-deep: #e2ebe5;
          --mist: #d5e4da;
          --white: #f8fbf9;
          --line: rgba(14, 28, 20, 0.1);
          --display: 'Syne', 'Figtree', sans-serif;
          --body: 'Figtree', 'Lato', sans-serif;
          min-height: 100vh;
          background: var(--paper);
          color: var(--ink);
          font-family: var(--body);
          overflow-x: hidden;
        }

        .landing h1, .landing h2, .landing h3,
        .landing-brand-word, .landing-brand-hero,
        .landing-module-name, .landing-step-num {
          font-family: var(--display);
        }

        /* Nav */
        .landing-nav {
          position: fixed;
          inset: 0 0 auto 0;
          z-index: 50;
          transition: background 0.3s ease, border-color 0.3s ease, backdrop-filter 0.3s ease;
          border-bottom: 1px solid transparent;
        }
        .landing-nav.is-solid {
          background: rgba(238, 245, 240, 0.92);
          backdrop-filter: blur(12px);
          border-bottom-color: var(--line);
        }
        .landing-nav-inner {
          max-width: 1120px;
          margin: 0 auto;
          padding: 0 1.5rem;
          height: 4rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .landing-brand {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          text-decoration: none;
          color: inherit;
        }
        .landing-brand-mark { width: 1.65rem; height: 1.65rem; }
        .landing-brand-word {
          font-weight: 800;
          font-size: 1.05rem;
          letter-spacing: -0.03em;
        }
        .landing-brand-word span { color: var(--leaf); }
        .landing-brand.is-muted .landing-brand-word { color: #5a7a66; }
        .landing-brand.is-muted .landing-brand-word span { color: #6b8f78; }
        .landing-nav-actions {
          display: flex;
          align-items: center;
          gap: 1.25rem;
        }
        .landing-nav-link {
          display: none;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--ink-soft);
          text-decoration: none;
        }
        .landing-nav-link:hover { color: var(--ink); }
        @media (min-width: 640px) {
          .landing-nav-link { display: block; }
        }
        .landing-nav-ghost {
          background: none;
          border: none;
          font: inherit;
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--ink);
          cursor: pointer;
          padding: 0;
        }
        .landing-nav-ghost:hover { color: var(--leaf); }
        .landing-nav-cta {
          background: var(--ink);
          color: var(--white);
          font-size: 0.85rem;
          font-weight: 700;
          padding: 0.55rem 1rem;
          border-radius: 0.55rem;
          text-decoration: none;
          transition: background 0.2s;
        }
        .landing-nav-cta:hover { background: var(--moss); }

        /* Hero */
        .landing-hero {
          position: relative;
          min-height: 100svh;
          display: grid;
          align-items: end;
          padding: 5.5rem 1.5rem 2rem;
          gap: 2rem;
        }
        @media (min-width: 960px) {
          .landing-hero {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
            align-items: center;
            padding: 6.5rem 2rem 3rem;
            max-width: 1200px;
            margin: 0 auto;
            gap: 2.5rem;
          }
        }
        .landing-hero-atmosphere {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 0;
        }
        .landing-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(40px);
          will-change: transform;
        }
        .landing-orb-a {
          width: 42vw;
          height: 42vw;
          max-width: 520px;
          max-height: 520px;
          top: -8%;
          right: -6%;
          background: radial-gradient(circle, var(--glow-soft) 0%, transparent 70%);
          animation: landingDrift 14s ease-in-out infinite alternate;
        }
        .landing-orb-b {
          width: 36vw;
          height: 36vw;
          max-width: 420px;
          max-height: 420px;
          bottom: 10%;
          left: -10%;
          background: radial-gradient(circle, var(--amber-soft) 0%, transparent 68%);
          animation: landingDrift 18s ease-in-out infinite alternate-reverse;
        }
        .landing-orb-c {
          width: 28vw;
          height: 28vw;
          max-width: 300px;
          max-height: 300px;
          top: 40%;
          left: 40%;
          background: radial-gradient(circle, rgba(47, 158, 95, 0.12) 0%, transparent 70%);
          animation: landingDrift 11s ease-in-out infinite alternate;
        }
        .landing-leaf-mesh {
          position: absolute;
          inset: 0;
          opacity: 0.35;
          background-image:
            radial-gradient(ellipse 80% 50% at 100% 0%, rgba(47, 158, 95, 0.12), transparent 55%),
            radial-gradient(ellipse 60% 40% at 0% 100%, rgba(212, 160, 23, 0.08), transparent 50%),
            url("data:image/svg+xml,%3Csvg width='72' height='72' viewBox='0 0 72 72' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%231b3a28' stroke-opacity='0.07' stroke-width='1'%3E%3Cpath d='M36 8c6 10 6 20 0 30-6-10-6-20 0-30zM36 34c6 10 6 20 0 30-6-10-6-20 0-30zM18 28c10 4 18 10 22 20-12-2-22-8-22-20zM54 28c-10 4-18 10-22 20 12-2 22-8 22-20z'/%3E%3C/g%3E%3C/svg%3E");
          background-size: auto, auto, 72px 72px;
        }
        .landing-hero-copy,
        .landing-hero-visual {
          position: relative;
          z-index: 1;
          opacity: 0;
          animation: landingRise 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .landing-brand-hero {
          font-size: clamp(2.8rem, 9vw, 5.5rem);
          font-weight: 800;
          letter-spacing: -0.06em;
          line-height: 0.9;
          margin: 0 0 1rem;
          color: var(--ink);
        }
        .landing-brand-hero::after {
          content: '';
          display: inline-block;
          width: 0.55em;
          height: 0.55em;
          margin-left: 0.12em;
          border-radius: 50%;
          background: var(--glow);
          vertical-align: 0.12em;
          box-shadow: 0 0 0 0 rgba(59, 181, 112, 0.45);
          animation: landingPing 2.4s ease-out infinite;
        }
        .landing-hero h1 {
          font-size: clamp(2rem, 5.5vw, 3.4rem);
          font-weight: 800;
          letter-spacing: -0.045em;
          line-height: 1.05;
          margin: 0 0 1.1rem;
          color: var(--ink);
        }
        .landing-hero h1 em {
          font-style: normal;
          color: var(--leaf);
        }
        .landing-lede {
          font-size: 1.1rem;
          line-height: 1.55;
          color: var(--ink-soft);
          max-width: 28rem;
          margin: 0 0 1.75rem;
          font-weight: 500;
        }
        .landing-cta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          opacity: 0;
          animation: landingRise 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .landing-cta-row.is-center { justify-content: center; }
        .landing-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--glow);
          color: #062012;
          font-weight: 700;
          font-size: 0.95rem;
          padding: 0.95rem 1.4rem;
          border-radius: 0.7rem;
          text-decoration: none;
          box-shadow: 0 10px 28px rgba(59, 181, 112, 0.28);
          transition: transform 0.2s, background 0.2s;
        }
        .landing-btn-primary:hover {
          background: #34c873;
          transform: translateY(-1px);
        }
        .landing-btn-secondary,
        .landing-btn-ghost {
          display: inline-flex;
          align-items: center;
          background: transparent;
          color: var(--ink);
          font-weight: 700;
          font-size: 0.95rem;
          padding: 0.9rem 1.3rem;
          border-radius: 0.7rem;
          text-decoration: none;
          border: 1.5px solid rgba(14, 28, 20, 0.18);
          cursor: pointer;
          font-family: inherit;
          transition: border-color 0.2s, color 0.2s;
        }
        .landing-btn-secondary:hover,
        .landing-btn-ghost:hover {
          border-color: var(--ink);
        }

        /* Demo window */
        .landing-hero-visual {
          width: 100%;
        }
        .landing-demo {
          background: var(--white);
          border: 1px solid rgba(14, 28, 20, 0.12);
          border-radius: 1rem;
          overflow: hidden;
          box-shadow:
            0 1px 0 rgba(255, 255, 255, 0.7) inset,
            0 24px 60px rgba(14, 28, 20, 0.12);
          animation: landingFloat 7s ease-in-out infinite;
        }
        .landing-demo-chrome {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.7rem 1rem;
          background: linear-gradient(180deg, #f3f8f4 0%, #eaf2ec 100%);
          border-bottom: 1px solid var(--line);
        }
        .landing-demo-dots {
          display: flex;
          gap: 0.35rem;
        }
        .landing-demo-dots span {
          width: 0.55rem;
          height: 0.55rem;
          border-radius: 50%;
          background: #c5d4cb;
        }
        .landing-demo-dots span:nth-child(1) { background: #e8a0a0; }
        .landing-demo-dots span:nth-child(2) { background: #e8c97a; }
        .landing-demo-dots span:nth-child(3) { background: #8fd4a8; }
        .landing-demo-title {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.78rem;
          font-weight: 700;
          color: var(--ink);
          letter-spacing: -0.02em;
          min-width: 0;
        }
        .landing-demo-logo {
          width: 0.95rem;
          height: 0.95rem;
          object-fit: contain;
          filter: brightness(0) saturate(100%) invert(48%) sepia(45%) saturate(600%) hue-rotate(95deg);
        }
        .landing-demo-path {
          color: #7a9484;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .landing-demo-status {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.7rem;
          font-weight: 600;
          color: #6b8f78;
          white-space: nowrap;
        }
        .landing-pulse {
          width: 0.45rem;
          height: 0.45rem;
          border-radius: 50%;
          background: var(--glow);
          box-shadow: 0 0 0 0 rgba(59, 181, 112, 0.5);
          animation: landingPing 2s ease-out infinite;
        }
        .landing-demo-body {
          padding: 1.15rem 1.15rem 0.5rem;
          min-height: 300px;
          max-height: 360px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          background:
            linear-gradient(180deg, rgba(238, 245, 240, 0.5) 0%, transparent 40%),
            var(--white);
        }
        .landing-bubble-row { display: flex; }
        .landing-bubble-row.is-user { justify-content: flex-end; }
        .landing-bubble-row.is-ai { justify-content: flex-start; }
        .landing-bubble {
          max-width: 88%;
          padding: 0.7rem 0.95rem;
          font-size: 0.9rem;
          line-height: 1.45;
          border-radius: 1rem;
        }
        .landing-bubble.is-user {
          background: var(--ink);
          color: var(--white);
          border-bottom-right-radius: 0.3rem;
        }
        .landing-bubble.is-ai {
          background: var(--paper-deep);
          color: var(--ink);
          border-bottom-left-radius: 0.3rem;
        }
        .landing-caret {
          display: inline-block;
          width: 2px;
          height: 0.95em;
          background: currentColor;
          margin-left: 2px;
          vertical-align: -0.1em;
          animation: landingBlink 0.9s step-end infinite;
        }
        .landing-typing {
          display: flex;
          gap: 0.3rem;
          align-items: center;
          padding: 0.85rem 1rem;
        }
        .landing-typing span {
          width: 0.35rem;
          height: 0.35rem;
          border-radius: 50%;
          background: #9ab5a5;
          animation: landingBounce 1s ease-in-out infinite;
        }
        .landing-typing.is-user span { background: #6b8f78; }
        .landing-typing span:nth-child(2) { animation-delay: 0.15s; }
        .landing-typing span:nth-child(3) { animation-delay: 0.3s; }
        .landing-demo-actions { padding-top: 0.25rem; }
        .landing-demo-input {
          margin: 0.75rem 1rem 1rem;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.85rem 1rem;
          background: var(--paper);
          border-radius: 0.75rem;
          color: #8aa193;
          font-size: 0.88rem;
          font-weight: 500;
        }
        .landing-mic {
          width: 1rem;
          height: 1rem;
          color: var(--leaf);
          flex-shrink: 0;
        }

        /* Try commands */
        .landing-try {
          padding: 0 1.5rem 3.5rem;
          position: relative;
          z-index: 2;
        }
        .landing-try-inner {
          max-width: 1120px;
          margin: 0 auto;
        }
        .landing-try-label {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #6b8f78;
          margin: 0 0 0.85rem;
        }
        .landing-try-row {
          display: flex;
          gap: 0.55rem;
          overflow-x: auto;
          padding-bottom: 0.35rem;
          scrollbar-width: none;
        }
        .landing-try-row::-webkit-scrollbar { display: none; }
        .landing-try-chip {
          flex: 0 0 auto;
          border: 1px solid var(--line);
          background: transparent;
          color: var(--ink-soft);
          font-family: inherit;
          font-size: 0.85rem;
          font-weight: 600;
          padding: 0.65rem 0.95rem;
          border-radius: 0.55rem;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s, color 0.2s;
          max-width: 22rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .landing-try-chip:hover {
          border-color: rgba(47, 158, 95, 0.45);
          color: var(--ink);
        }
        .landing-try-chip.is-active {
          background: var(--ink);
          border-color: var(--ink);
          color: var(--white);
        }

        /* Modules */
        .landing-modules {
          padding: 5rem 1.5rem;
          max-width: 1120px;
          margin: 0 auto;
        }
        .landing-modules h2,
        .landing-ambient h2,
        .landing-how h2,
        .landing-close h2 {
          font-size: clamp(2.1rem, 5vw, 3.25rem);
          font-weight: 800;
          letter-spacing: -0.045em;
          line-height: 1.05;
          margin: 0 0 1rem;
        }
        .landing-modules h2 span,
        .landing-ambient h2 span {
          color: #5a7a66;
        }
        .landing-section-lede {
          font-size: 1.1rem;
          line-height: 1.55;
          color: var(--ink-soft);
          max-width: 34rem;
          margin: 0 0 2.75rem;
          font-weight: 500;
        }
        .landing-module-list {
          list-style: none;
          margin: 0;
          padding: 0;
          border-top: 1px solid var(--line);
        }
        .landing-module-list li {
          padding: 1.35rem 0;
          border-bottom: 1px solid var(--line);
        }
        .landing-module-list li > div {
          display: grid;
          gap: 0.35rem;
        }
        @media (min-width: 720px) {
          .landing-module-list li > div {
            grid-template-columns: 10rem 1fr;
            gap: 1.5rem;
            align-items: baseline;
          }
        }
        .landing-module-name {
          font-size: 1.2rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--leaf);
        }
        .landing-module-line {
          font-size: 1.05rem;
          color: var(--ink-soft);
          font-weight: 500;
          line-height: 1.45;
        }

        /* Ambient */
        .landing-ambient {
          position: relative;
          padding: 5.5rem 1.5rem;
          background: var(--moss);
          color: var(--white);
          overflow: hidden;
        }
        .landing-ambient-glow {
          position: absolute;
          width: 50vw;
          height: 50vw;
          max-width: 560px;
          max-height: 560px;
          top: -20%;
          right: -10%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(59, 181, 112, 0.35) 0%, transparent 70%);
          pointer-events: none;
        }
        .landing-ambient > * { position: relative; z-index: 1; max-width: 1120px; margin-left: auto; margin-right: auto; }
        .landing-kicker {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--glow);
          margin: 0 0 0.85rem;
        }
        .landing-ambient .landing-section-lede { color: rgba(248, 251, 249, 0.72); }
        .landing-ambient-stream {
          margin-top: 2.5rem;
          display: grid;
          gap: 0.55rem;
          max-width: 36rem;
        }
        .landing-utterance {
          display: grid;
          grid-template-columns: 2.5rem 1fr;
          gap: 0.85rem;
          padding: 0.85rem 1rem;
          background: rgba(248, 251, 249, 0.06);
          border-left: 2px solid rgba(59, 181, 112, 0.55);
          opacity: 0;
          animation: landingRise 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .landing-utterance time {
          font-size: 0.72rem;
          font-weight: 700;
          color: rgba(248, 251, 249, 0.4);
          font-variant-numeric: tabular-nums;
          padding-top: 0.15rem;
        }
        .landing-utterance p {
          margin: 0;
          font-size: 0.95rem;
          font-style: italic;
          color: rgba(248, 251, 249, 0.88);
          line-height: 1.4;
        }
        .landing-listening {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.9rem 1rem;
          color: var(--glow);
          font-size: 0.85rem;
          font-weight: 600;
        }
        .landing-wave {
          display: flex;
          align-items: flex-end;
          gap: 0.18rem;
          height: 1rem;
        }
        .landing-wave i {
          display: block;
          width: 0.18rem;
          height: 100%;
          background: var(--glow);
          border-radius: 99px;
          transform-origin: bottom;
          animation: landingWave 0.9s ease-in-out infinite alternate;
        }

        /* How */
        .landing-how {
          padding: 5.5rem 1.5rem;
          max-width: 1120px;
          margin: 0 auto;
        }
        .landing-steps {
          list-style: none;
          margin: 2.75rem 0 0;
          padding: 0;
          display: grid;
          gap: 2.5rem;
        }
        @media (min-width: 800px) {
          .landing-steps {
            grid-template-columns: repeat(3, 1fr);
            gap: 2rem;
          }
        }
        .landing-steps li {
          border-top: 2px solid var(--glow);
          padding-top: 1.25rem;
        }
        .landing-step-num {
          display: block;
          font-size: 3rem;
          font-weight: 800;
          letter-spacing: -0.04em;
          color: var(--mist);
          line-height: 1;
          margin-bottom: 0.85rem;
          user-select: none;
        }
        .landing-steps h3 {
          font-size: 1.35rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          margin: 0 0 0.55rem;
        }
        .landing-steps p {
          margin: 0;
          color: var(--ink-soft);
          line-height: 1.55;
          font-weight: 500;
          font-size: 1rem;
        }

        /* Close */
        .landing-close {
          padding: 5.5rem 1.5rem 6rem;
          text-align: center;
          background:
            radial-gradient(ellipse 70% 60% at 50% 0%, rgba(59, 181, 112, 0.16), transparent 60%),
            var(--paper-deep);
        }
        .landing-close-mark {
          width: 3.25rem;
          height: 3.25rem;
          margin: 0 auto 1.5rem;
        }
        .landing-close h2 em {
          font-style: normal;
          color: var(--leaf);
        }
        .landing-close p {
          max-width: 28rem;
          margin: 0 auto 2rem;
          color: var(--ink-soft);
          font-size: 1.05rem;
          line-height: 1.55;
          font-weight: 500;
        }

        /* Footer */
        .landing-footer {
          border-top: 1px solid var(--line);
          padding: 1.75rem 1.5rem;
          background: var(--paper);
        }
        .landing-footer-inner {
          max-width: 1120px;
          margin: 0 auto;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        .landing-footer p {
          margin: 0;
          font-size: 0.8rem;
          color: #6b8f78;
        }

        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { scrollbar-width: none; -ms-overflow-style: none; }

        @keyframes landingRise {
          from { opacity: 0; transform: translateY(22px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes landingDrift {
          from { transform: translate(0, 0) scale(1); }
          to { transform: translate(-3%, 4%) scale(1.06); }
        }
        @keyframes landingFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes landingPing {
          0% { box-shadow: 0 0 0 0 rgba(59, 181, 112, 0.45); }
          70% { box-shadow: 0 0 0 10px rgba(59, 181, 112, 0); }
          100% { box-shadow: 0 0 0 0 rgba(59, 181, 112, 0); }
        }
        @keyframes landingBlink {
          50% { opacity: 0; }
        }
        @keyframes landingBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes landingWave {
          from { transform: scaleY(0.35); }
          to { transform: scaleY(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .landing-orb,
          .landing-demo,
          .landing-pulse,
          .landing-brand-hero::after,
          .landing-wave i,
          .landing-typing span {
            animation: none !important;
          }
          .landing-hero-copy,
          .landing-hero-visual,
          .landing-cta-row,
          .landing-utterance {
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
