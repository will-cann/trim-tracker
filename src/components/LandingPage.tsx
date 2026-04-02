import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/authContext';
import { ActionPreview } from './ActionPreview';
import type { ProposedAction } from '../types/definitions';
import logo from '../assets/logo.png';

/* ─── Scroll-reveal hook ─── */
function useReveal<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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
const Reveal: React.FC<{
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

/* ─── Neurocann brain+leaf logo as inline SVG (from original site) ─── */
const NeurocannLogo: React.FC<{ className?: string; stroke?: string }> = ({
  className = '',
  stroke = '#3BB570',
}) => (
  <svg
    className={className}
    viewBox="0 0 203 197"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
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
    <path d="M59.8154 120.453C56.1054 120.258 53.602 119.488 50.3154 119.953C46.4633 120.499 44.7303 121.358 41.8154 123.453C39.2344 125.309 37.9551 126.73 36.3154 129.453C34.7092 132.121 34.0414 133.87 33.6099 136.953C33.1482 140.252 33.3162 142.276 34.3154 145.453" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M106.815 7.45337C106.815 7.45337 109.269 10.5973 110.315 12.4534C115.007 20.7737 117.815 35.9534 117.815 35.9534C117.815 35.9534 120.508 50.1066 121.533 58.9534C122.628 68.411 123.079 83.284 123.079 83.284C123.079 83.284 123.203 94.6089 122.858 101.853C122.548 108.349 122.435 111.979 121.815 118.453C120.898 128.045 120.635 132.453 118.612 142.953C117.164 150.468 116.016 155.813 113.815 161.953C111.626 168.063 107.394 177.282 107.394 177.282" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M123.315 109.453C123.315 109.453 127.481 103.587 130.315 99.9534C134.406 94.71 141.315 86.9534 141.315 86.9534C141.315 86.9534 148.527 80.135 153.315 75.9534C157.91 71.9408 165.315 65.9534 165.315 65.9534" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M165.315 65.9534C165.315 65.9534 164.612 75.7369 163.815 81.9534C163.211 86.6657 162.862 89.3191 161.815 93.9534C160.604 99.3169 159.637 102.265 157.815 107.453C155.64 113.646 154.117 117.018 151.315 122.953C148.295 129.352 146.602 132.977 142.815 138.953C138.049 146.476 134.996 150.542 128.815 156.953C122.465 163.541 118.44 167.895 110.815 172.953" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M146.315 133.453L157.815 126.453C157.815 126.453 164.391 122.823 168.815 120.953C175.414 118.165 179.313 116.965 186.315 115.453C191.714 114.288 200.315 113.453 200.315 113.453" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M200.315 113.453C200.315 113.453 195.689 121.539 192.315 126.453C187.363 133.669 184.464 137.725 178.315 143.953C172.765 149.576 169.341 152.501 162.815 156.953C155.168 162.171 150.393 164.47 141.815 167.953C135.35 170.579 131.705 172.348 124.815 173.453C119.221 174.351 115.958 174.464 110.315 173.953" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M151 164C151 164 164.954 160.54 174 161C179.056 161.257 181.926 161.641 186.815 162.953C190.215 163.866 191.996 164.782 195.315 165.953" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M195.315 165.953C193.005 167.374 191.69 168.141 189.315 169.453C185.112 171.776 182.747 173.102 178.315 174.953C172.275 177.476 168.717 178.586 162.315 179.953C155.019 181.511 143.315 181.953 143.315 181.953C143.315 181.953 134.435 181.916 128.815 181.151C123.07 180.369 114.315 177.953 114.315 177.953" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M112.5 177.5C112.5 177.5 119.113 180.16 121.815 181.953C124.148 183.501 126 184.502 127.815 186.953C129.585 189.343 130.305 191.023 130.815 193.953" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
    <path d="M130.815 193.953C126.793 193.788 124.442 193.2 120.815 191.453C117.543 189.877 113.315 185.953 113.315 185.953C113.315 185.953 110.595 183.426 109.315 181.453C108.365 179.988 107.315 177.453 107.315 177.453" stroke={stroke} strokeWidth="5" strokeLinecap="round"/>
  </svg>
);

/* ─── Demo conversation data ─── */
type DemoStep =
  | { type: 'user'; text: string }
  | { type: 'ai'; text: string }
  | { type: 'actions'; actions: ProposedAction[] }
  | { type: 'confirmed' }
  | { type: 'pause'; ms: number };

const DEMO_SCENARIOS: DemoStep[][] = [
  // Scenario 1: Move plants + create trim session
  [
    { type: 'user', text: 'Move the OG Kush from veg 2 to flower 1 and start a trim session for the GDP harvest' },
    { type: 'ai', text: 'I\'ll move the plants and set up the trim session.' },
    {
      type: 'actions',
      actions: [
        { type: 'move_plants', data: { strain: 'OG Kush', fromRoom: 'Veg Room 2', toRoom: 'Flower Room 1', plantCount: 24 } },
        { type: 'create_session', data: { strain: 'Granddaddy Purple', harvestName: 'GDP Harvest #4', startWeight: 2400 } },
      ],
    },
    { type: 'pause', ms: 2200 },
    { type: 'confirmed' },
    { type: 'pause', ms: 3000 },
  ],
  // Scenario 2: Create harvest + allocate
  [
    { type: 'user', text: 'Create a harvest for Wedding Cake and allocate 60% to drying, 40% fresh frozen' },
    { type: 'ai', text: 'Setting up the harvest with split allocation.' },
    {
      type: 'actions',
      actions: [
        { type: 'create_harvest', data: { strain: 'Wedding Cake', plantCount: 36, dryingLocation: 'Dry Room A' } },
        { type: 'allocate_harvest', data: { allocation: 'drying', percentage: '60%', location: 'Dry Room A' } },
        { type: 'allocate_harvest', data: { allocation: 'fresh_frozen', percentage: '40%', location: 'Freezer 1' } },
      ],
    },
    { type: 'pause', ms: 2200 },
    { type: 'confirmed' },
    { type: 'pause', ms: 3000 },
  ],
  // Scenario 3: Package + extraction
  [
    { type: 'user', text: 'Create a 1lb flower package from the Gelato harvest and log an extraction run — 500g fresh frozen to bubble hash' },
    { type: 'ai', text: 'Creating the package and logging extraction.' },
    {
      type: 'actions',
      actions: [
        { type: 'create_package', data: { strain: 'Gelato', packageType: 'flower', weight: 453.6, harvestName: 'Gelato Harvest #2' } },
        { type: 'record_extraction', data: { inputPackageType: 'fresh_frozen', outputPackageType: 'bubble_hash', inputQuantity: 500, outputQuantity: 72, strain: 'Gelato' } },
      ],
    },
    { type: 'pause', ms: 2200 },
    { type: 'confirmed' },
    { type: 'pause', ms: 3000 },
  ],
];

const AIChatDemo: React.FC = () => {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [typingText, setTypingText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([]);
  const [pendingActions, setPendingActions] = useState<ProposedAction[] | null>(null);
  const [actionStatus, setActionStatus] = useState<'confirmed' | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const scenario = DEMO_SCENARIOS[scenarioIndex];

  useEffect(() => {
    if (stepIndex >= scenario.length) {
      // Move to next scenario
      const timeout = setTimeout(() => {
        setScenarioIndex((s) => (s + 1) % DEMO_SCENARIOS.length);
        setStepIndex(0);
        setMessages([]);
        setPendingActions(null);
        setActionStatus(undefined);
        setTypingText('');
      }, 500);
      return () => clearTimeout(timeout);
    }

    const step = scenario[stepIndex];

    if (step.type === 'user' || step.type === 'ai') {
      // Type out the message character by character
      setIsTyping(true);
      let charIndex = 0;
      const speed = step.type === 'user' ? 30 : 18;

      const typeInterval = setInterval(() => {
        if (charIndex <= step.text.length) {
          setTypingText(step.text.slice(0, charIndex));
          charIndex++;
        } else {
          clearInterval(typeInterval);
          setIsTyping(false);
          // Commit message and advance
          setMessages((prev) => [...prev, { role: step.type as 'user' | 'ai', text: step.text }]);
          setTypingText('');
          setTimeout(() => setStepIndex((s) => s + 1), 400);
        }
      }, speed);

      return () => clearInterval(typeInterval);
    }

    if (step.type === 'actions') {
      // Show action preview with a slight delay
      const timeout = setTimeout(() => {
        setPendingActions(step.actions);
        setActionStatus(undefined);
        setStepIndex((s) => s + 1);
      }, 300);
      return () => clearTimeout(timeout);
    }

    if (step.type === 'confirmed') {
      setActionStatus('confirmed');
      setTimeout(() => setStepIndex((s) => s + 1), 100);
      return;
    }

    if (step.type === 'pause') {
      const timeout = setTimeout(() => setStepIndex((s) => s + 1), step.ms);
      return () => clearTimeout(timeout);
    }
  }, [stepIndex, scenarioIndex, scenario]);

  // Auto-scroll
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, typingText, pendingActions, actionStatus]);

  // Figure out what role is currently typing
  const currentStep = stepIndex < scenario.length ? scenario[stepIndex] : null;
  const typingRole = currentStep && (currentStep.type === 'user' || currentStep.type === 'ai') ? currentStep.type : null;

  return (
    <div className="w-full max-w-lg">
      {/* Chat window frame */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)' }}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
          <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center overflow-hidden">
            <img src={logo} alt="" className="w-4 h-4 object-contain brightness-0 invert" />
          </div>
          <span className="text-sm font-bold text-gray-900 tracking-tight">NeuroCann</span>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
            <span className="text-xs text-gray-400">Online</span>
          </div>
        </div>

        {/* Messages area */}
        <div ref={containerRef} className="px-5 py-5 space-y-3 min-h-[320px] max-h-[380px] overflow-y-auto scrollbar-hide">
          {/* Committed messages */}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-gray-900 text-white rounded-br-md'
                    : 'bg-gray-50 text-gray-800 rounded-bl-md'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Currently typing message */}
          {typingRole && typingText && (
            <div className={`flex ${typingRole === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed rounded-2xl ${
                  typingRole === 'user'
                    ? 'bg-gray-900 text-white rounded-br-md'
                    : 'bg-gray-50 text-gray-800 rounded-bl-md'
                }`}
              >
                {typingText}
                {isTyping && <span className="inline-block w-0.5 h-4 bg-current ml-0.5 align-middle animate-pulse"></span>}
              </div>
            </div>
          )}

          {/* Typing indicator dots (before any text appears) */}
          {typingRole && !typingText && (
            <div className={`flex ${typingRole === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`px-4 py-3 rounded-2xl flex gap-1 ${
                typingRole === 'user' ? 'bg-gray-900 rounded-br-md' : 'bg-gray-50 rounded-bl-md'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${typingRole === 'user' ? 'bg-gray-500' : 'bg-gray-300'}`} style={{ animationDelay: '0ms' }}></span>
                <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${typingRole === 'user' ? 'bg-gray-500' : 'bg-gray-300'}`} style={{ animationDelay: '150ms' }}></span>
                <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${typingRole === 'user' ? 'bg-gray-500' : 'bg-gray-300'}`} style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          )}

          {/* Action preview — using the real component */}
          {pendingActions && (
            <div className="pt-1">
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

        {/* Input bar */}
        <div className="px-4 pb-4">
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
            <span className="text-sm text-gray-300 select-none">Talk or type a command...</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Static UI mockup components ─── */

const MockRoomCard: React.FC<{
  name: string; phase: string; strain: string; plants: number;
  health: number; daysLeft?: number; phaseColor: string;
}> = ({ name, phase, strain, plants, health, daysLeft, phaseColor }) => (
  <div className={`border rounded-xl p-4 bg-white ${health >= 90 ? 'border-gray-200' : health >= 70 ? 'border-amber-300' : 'border-red-300'}`}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm font-bold text-gray-900">{name}</span>
      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${phaseColor}`}>{phase}</span>
    </div>
    <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
      <span>{strain}</span>
      <span className="text-gray-200">|</span>
      <span>{plants} plants</span>
      {daysLeft != null && <>
        <span className="text-gray-200">|</span>
        <span>~{daysLeft}d left</span>
      </>}
    </div>
    {/* Health bar */}
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${health >= 90 ? 'bg-emerald-400' : health >= 70 ? 'bg-amber-400' : 'bg-red-400'}`}
          style={{ width: `${health}%` }}
        />
      </div>
      <span className={`text-[11px] font-bold tabular-nums ${health >= 90 ? 'text-emerald-500' : health >= 70 ? 'text-amber-500' : 'text-red-500'}`}>
        {health}%
      </span>
    </div>
  </div>
);

const MockTrimProgress: React.FC = () => {
  const segments = [
    { label: 'Flower', grams: 1842, color: 'bg-emerald-500', pct: 48 },
    { label: 'Shake', grams: 624, color: 'bg-amber-500', pct: 16 },
    { label: 'Trim', grams: 312, color: 'bg-blue-500', pct: 8 },
    { label: 'Waste', grams: 198, color: 'bg-red-400', pct: 5 },
    { label: 'Remaining', grams: 884, color: 'bg-gray-200', pct: 23 },
  ];
  return (
    <div>
      {/* Stat row — 6 cols for full-width panel */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {[
          { label: 'Start Weight', value: '3,860g', color: 'text-gray-900' },
          { label: 'Flower', value: '1,842g', color: 'text-emerald-600' },
          { label: 'Shake', value: '624g', color: 'text-amber-600' },
          { label: 'Trim', value: '312g', color: 'text-blue-600' },
          { label: 'Waste', value: '198g', color: 'text-red-500' },
          { label: 'Trimmers', value: '6', color: 'text-gray-900' },
        ].map((s) => (
          <div key={s.label} className="bg-gray-50 rounded-lg px-3 py-2.5">
            <div className={`text-base font-black tabular-nums ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-gray-400 font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-2.5">
        {segments.map((seg) => (
          <div key={seg.label} className={`${seg.color}`} style={{ width: `${seg.pct}%` }} />
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${seg.color}`} />
            <span className="text-[11px] text-gray-400">{seg.label}</span>
            <span className="text-[11px] font-bold text-gray-600 tabular-nums">{seg.grams.toLocaleString()}g</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const MockHarvestStats: React.FC = () => (
  <div>
    {/* Batch tabs */}
    <div className="flex gap-1 mb-4">
      {['WC-001', 'WC-002', 'WC-003'].map((batch, i) => (
        <button
          key={batch}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
            i === 1 ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'
          }`}
        >
          {batch}
          {i === 0 && <span className="ml-1 text-emerald-300">&#10003;</span>}
        </button>
      ))}
    </div>
    {/* Live stat row — 5 cols to fill wider panel */}
    <div className="grid grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
      {[
        { label: 'Plants', value: '12', sub: 'of 36' },
        { label: 'Wet Weight', value: '5,832g', sub: '+486g avg' },
        { label: 'Allocation', value: '60/40', sub: 'dry / frozen' },
        { label: 'Drying', value: '3,499g', sub: '60% split' },
        { label: 'Fresh Frozen', value: '2,333g', sub: '40% split' },
      ].map((s) => (
        <div key={s.label} className="bg-gray-50 rounded-lg px-3 py-2.5 text-center">
          <div className="text-base font-black text-gray-900 tabular-nums">{s.value}</div>
          <div className="text-[10px] text-gray-400">{s.sub}</div>
          <div className="text-[10px] text-gray-300 font-medium mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
    {/* Weight entries — 2-col grid for wider layout */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
      {[
        { plant: '#7', weight: '512g', time: '2:14 PM' },
        { plant: '#8', weight: '478g', time: '2:18 PM' },
        { plant: '#9', weight: '496g', time: '2:23 PM' },
        { plant: '#10', weight: '521g', time: '2:27 PM' },
        { plant: '#11', weight: '463g', time: '2:31 PM' },
        { plant: '#12', weight: '498g', time: '2:35 PM' },
      ].map((entry) => (
        <div key={entry.plant} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg">
          <span className="text-xs font-medium text-gray-500">{entry.plant}</span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-300">{entry.time}</span>
            <span className="text-xs font-bold text-gray-900 tabular-nums">{entry.weight}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const MockReportsChart: React.FC = () => {
  const bars = [
    { label: 'Mon', flower: 62, trim: 18 },
    { label: 'Tue', flower: 78, trim: 24 },
    { label: 'Wed', flower: 54, trim: 14 },
    { label: 'Thu', flower: 85, trim: 28 },
    { label: 'Fri', flower: 92, trim: 32 },
  ];
  const maxVal = 100;
  return (
    <div>
      {/* Metric cards */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {[
          { label: 'Avg g/hr', value: '142', color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Total LBs', value: '18.4', color: 'text-blue-600 bg-blue-50' },
          { label: 'Labor Hours', value: '86.5', color: 'text-amber-600 bg-amber-50' },
        ].map((m) => (
          <div key={m.label} className={`rounded-lg px-3 py-2.5 ${m.color.split(' ')[1]}`}>
            <div className={`text-lg font-black tabular-nums ${m.color.split(' ')[0]}`}>{m.value}</div>
            <div className="text-[10px] text-gray-400 font-medium">{m.label}</div>
          </div>
        ))}
      </div>
      {/* Chart */}
      <div className="flex items-end gap-2 h-28 px-1">
        {bars.map((bar) => (
          <div key={bar.label} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col items-center justify-end" style={{ height: '100px' }}>
              <div className="w-full flex flex-col items-stretch">
                <div
                  className="bg-emerald-400 rounded-t"
                  style={{ height: `${(bar.flower / maxVal) * 80}px` }}
                />
                <div
                  className="bg-blue-400 rounded-b"
                  style={{ height: `${(bar.trim / maxVal) * 80}px` }}
                />
              </div>
            </div>
            <span className="text-[10px] text-gray-400">{bar.label}</span>
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex justify-center gap-4 mt-3">
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-[11px] text-gray-400">Flower (lbs)</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-[11px] text-gray-400">Trim (lbs)</span></div>
      </div>
    </div>
  );
};

/* ─── Showcase panel wrapper ─── */
const ShowcasePanel: React.FC<{ children: React.ReactNode; label: string; accent?: string }> = ({ children, label, accent = 'bg-emerald-500' }) => (
  <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06)' }}>
    {/* Colored top accent */}
    <div className={`h-0.5 ${accent}`} />
    <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full ${accent}`} />
      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</span>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

/* ─── Stats ─── */
const STATS = [
  { value: '19.6k', label: 'Plants managed', accent: 'bg-emerald-500' },
  { value: '112k', label: 'Compliance API calls', accent: 'bg-blue-500' },
  { value: '<2s', label: 'Avg. voice command', accent: 'bg-amber-500' },
];

/* ─── How it works steps ─── */
const STEPS = [
  {
    num: '01',
    title: 'Speak or type',
    body: 'Tell NeuroCann what you need in plain language. "Start a trim session for the Wedding Cake harvest with 4 trimmers."',
  },
  {
    num: '02',
    title: 'Review the action',
    body: 'The AI proposes exactly what it will do. You see every detail before anything changes.',
  },
  {
    num: '03',
    title: 'Confirm and go',
    body: 'One tap. The system executes across your plant map, harvest records, trim logs, and compliance trail.',
  },
];

/* ─── Main Landing Page ─── */
export const LandingPage: React.FC = () => {
  const { login } = useAuth();
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navOpaque = scrollY > 40;

  return (
    <div className="min-h-screen bg-white">
      {/* ═══════════════════ NAV ═══════════════════ */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          navOpaque
            ? 'bg-white/95 backdrop-blur-sm border-b border-gray-100'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <NeurocannLogo className="w-7 h-7" stroke={navOpaque ? '#3BB570' : '#3BB570'} />
            <span className="text-base font-black text-gray-900 tracking-tight">
              neuro<span className="text-gray-400">cann</span>
            </span>
          </div>
          <div className="flex items-center gap-8">
            <a href="#capabilities" className="hidden sm:block text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
              Platform
            </a>
            <a href="#how-it-works" className="hidden sm:block text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
              How It Works
            </a>
            <button
              onClick={() => login()}
              className="text-sm font-bold text-gray-900 hover:text-emerald-600 transition-colors"
            >
              Sign In
            </button>
            <a
              href="mailto:will@neurocann.com?subject=NeuroCann%20Demo%20Request"
              className="bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors"
            >
              Book Demo
            </a>
          </div>
        </div>
      </nav>

      {/* ═══════════════════ HERO ═══════════════════ */}
      <section className="relative pt-28 pb-20 lg:pt-36 lg:pb-28 px-6 lg:px-8 overflow-hidden">
        {/* Radial glows — larger and more saturated */}
        <div className="absolute top-0 right-0 w-[1000px] h-[1000px] -translate-y-1/4 translate-x-1/4 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(59,181,112,0.08) 0%, rgba(59,181,112,0) 65%)' }} />
        <div className="absolute bottom-0 left-0 w-[800px] h-[800px] translate-y-1/4 -translate-x-1/4 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(28,158,255,0.05) 0%, rgba(28,158,255,0) 65%)' }} />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#1A1A1A 1px, transparent 1px), linear-gradient(90deg, #1A1A1A 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
        <div className="max-w-7xl mx-auto relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            {/* Left — copy */}
            <div>
              <div className="flex items-center gap-3 mb-6" style={{ opacity: 0, animation: 'heroFadeIn 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s forwards' }}>
                <div className="w-10 h-0.5 bg-emerald-500 rounded-full" />
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-emerald-600">
                  AI-Powered Cultivation Ops
                </p>
              </div>
              <h1
                className="text-5xl sm:text-6xl lg:text-[4.5rem] font-black text-gray-900 leading-[1.02] tracking-tight mb-7"
                style={{ opacity: 0, animation: 'heroFadeIn 0.8s cubic-bezier(0.16,1,0.3,1) 0.2s forwards' }}
              >
                Run your facility
                <br />
                with your <span className="text-emerald-600">voice</span>.
              </h1>
              <p
                className="text-lg text-gray-400 leading-relaxed max-w-md mb-10"
                style={{ opacity: 0, animation: 'heroFadeIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.4s forwards' }}
              >
                NeuroCann manages cultivation, harvests, trim sessions, packaging, and extraction — all through
                a single conversational interface.
              </p>
              <div
                className="flex flex-wrap gap-3"
                style={{ opacity: 0, animation: 'heroFadeIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.55s forwards' }}
              >
                <a
                  href="mailto:will@neurocann.com?subject=NeuroCann%20Demo%20Request"
                  className="group relative bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-4 rounded-xl transition-all text-sm inline-block shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30"
                >
                  Book a Demo
                  <span className="inline-block ml-2 transition-transform group-hover:translate-x-0.5">&rarr;</span>
                </a>
                <a
                  href="#how-it-works"
                  className="border-2 border-gray-200 hover:border-gray-900 text-gray-700 hover:text-gray-900 font-bold px-8 py-4 rounded-xl transition-all text-sm"
                >
                  See How It Works
                </a>
              </div>
            </div>

            {/* Right — live AI demo */}
            <div
              className="flex justify-center lg:justify-end"
              style={{ opacity: 0, animation: 'heroFadeIn 0.9s cubic-bezier(0.16,1,0.3,1) 0.3s forwards' }}
            >
              <AIChatDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ STATS BAR ═══════════════════ */}
      <section className="border-y border-gray-100 bg-gray-50/50">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-14 grid grid-cols-3 gap-8">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 100}>
              <div className="text-center">
                <div className={`w-6 h-1 ${s.accent} rounded-full mx-auto mb-3`} />
                <div className="text-3xl sm:text-4xl font-black text-gray-900 tabular-nums">{s.value}</div>
                <div className="text-xs sm:text-sm text-gray-400 mt-1.5 font-medium">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════════════════ PLANT MAP SHOWCASE — full-width hero style ═══════════════════ */}
      <section id="capabilities" className="py-24 lg:py-32 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Copy */}
          <Reveal>
            <div className="max-w-xl mb-14">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-0.5 bg-emerald-500 rounded-full" />
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-emerald-600">
                  Cultivation
                </p>
              </div>
              <h2 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight mb-4">
                Every room. Every plant.
              </h2>
              <p className="text-lg text-gray-400 leading-relaxed">
                Plant Map gives you a live overview of your entire facility — health status, growth phase, flip dates, and strain distribution across every room. Issues surface before they spread.
              </p>
            </div>
          </Reveal>
          {/* Wide card grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { name: 'Flower Room 1', phase: 'Flower', strain: 'Wedding Cake', plants: 48, health: 96, daysLeft: 18, phaseColor: 'text-emerald-600 bg-emerald-50' },
              { name: 'Flower Room 2', phase: 'Flower', strain: 'OG Kush', plants: 36, health: 72, daysLeft: 31, phaseColor: 'text-emerald-600 bg-emerald-50' },
              { name: 'Veg Room A', phase: 'Veg', strain: 'Gelato', plants: 64, health: 98, daysLeft: undefined, phaseColor: 'text-blue-600 bg-blue-50' },
              { name: 'Dry Room 1', phase: 'Dry', strain: 'GDP', plants: 24, health: 100, daysLeft: 5, phaseColor: 'text-amber-600 bg-amber-50' },
            ].map((room, i) => (
              <Reveal key={room.name} delay={i * 80}>
                <MockRoomCard {...room} />
              </Reveal>
            ))}
          </div>
          {/* Phase tags */}
          <Reveal delay={350}>
            <div className="flex flex-wrap gap-2 mt-8">
              {['Nursery', 'Vegetative', 'Flowering', 'Drying'].map((phase) => (
                <span key={phase} className="text-xs font-bold text-gray-400 bg-gray-100 px-3.5 py-1.5 rounded-lg">{phase}</span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════ TRIM SESSIONS SHOWCASE — stacked, visual-dominant ═══════════════════ */}
      <section className="py-24 lg:py-32 px-6 lg:px-8 bg-gray-50/80">
        <div className="max-w-7xl mx-auto">
          {/* Copy row — compact */}
          <Reveal>
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-12">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-0.5 bg-blue-500 rounded-full" />
                  <p className="text-xs font-bold tracking-[0.2em] uppercase text-blue-600">
                    Trim Tracking
                  </p>
                </div>
                <h2 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight">
                  Flower. Shake. Waste.<br className="hidden sm:block" /> Accounted.
                </h2>
              </div>
              <p className="text-lg text-gray-400 leading-relaxed max-w-md lg:text-right">
                Track every gram across your trim crew in real time. See who&apos;s producing, how material is being categorized, and where yield is going.
              </p>
            </div>
          </Reveal>
          {/* Wide showcase panel */}
          <Reveal delay={150}>
            <ShowcasePanel label="Trim Session — GDP Harvest #4" accent="bg-blue-500">
              <MockTrimProgress />
            </ShowcasePanel>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════ HARVEST DAY SHOWCASE — asymmetric 4/8 split ═══════════════════ */}
      <section className="py-24 lg:py-32 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            <Reveal className="lg:col-span-4" direction="left">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-0.5 bg-amber-500 rounded-full" />
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-amber-600">
                  Harvest Day
                </p>
              </div>
              <h2 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight mb-5">
                Weigh. Allocate.
                <br />
                Submit.
              </h2>
              <p className="text-lg text-gray-400 leading-relaxed">
                The harvest cockpit handles live weighing, allocation splits between drying and fresh frozen, contamination flagging, and batch submission — all in one screen. Voice-enabled for gloved hands.
              </p>
            </Reveal>
            <Reveal className="lg:col-span-8" delay={150} direction="right">
              <ShowcasePanel label="Harvest Day — Wedding Cake" accent="bg-amber-500">
                <MockHarvestStats />
              </ShowcasePanel>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══════════════════ REPORTS SHOWCASE — centered, wide panel ═══════════════════ */}
      <section className="py-24 lg:py-32 px-6 lg:px-8 bg-gray-50/80">
        <div className="max-w-7xl mx-auto text-center">
          <Reveal>
            <div className="flex items-center gap-3 mb-4 justify-center">
              <div className="w-10 h-0.5 bg-red-400 rounded-full" />
              <p className="text-xs font-bold tracking-[0.2em] uppercase text-red-500">
                Reports & Analytics
              </p>
            </div>
            <h2 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight mb-4">
              Data that drives decisions.
            </h2>
            <p className="text-lg text-gray-400 leading-relaxed max-w-lg mx-auto mb-12">
              Throughput charts, trimmer performance rankings, labor cost analysis, and yield trends — all generated automatically from your operational data.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <div className="max-w-3xl mx-auto">
              <ShowcasePanel label="Weekly Report — Apr 1" accent="bg-red-400">
                <MockReportsChart />
              </ShowcasePanel>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════ HOW IT WORKS ═══════════════════ */}
      <section id="how-it-works" className="relative py-28 lg:py-36 px-6 lg:px-8 overflow-hidden">
        {/* Background texture */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 20% 50%, rgba(59,181,112,0.04) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(28,158,255,0.04) 0%, transparent 50%)' }} />
        <div className="absolute inset-0 pointer-events-none opacity-[0.02]" style={{ backgroundImage: 'linear-gradient(#1A1A1A 1px, transparent 1px), linear-gradient(90deg, #1A1A1A 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
        <div className="max-w-7xl mx-auto relative">
          <Reveal>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-0.5 bg-emerald-500 rounded-full" />
              <p className="text-xs font-bold tracking-[0.2em] uppercase text-emerald-600">
                How It Works
              </p>
            </div>
            <h2 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight mb-20 max-w-md">
              Three steps.
              <br />
              Zero friction.
            </h2>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-16 md:gap-10">
            {STEPS.map((step, i) => {
              const accents = ['border-emerald-500', 'border-blue-500', 'border-amber-500'];
              const numColors = ['text-emerald-200', 'text-blue-200', 'text-amber-200'];
              return (
                <Reveal key={step.num} delay={i * 120}>
                  <div className={`border-l-2 ${accents[i]} pl-8`}>
                    <span className={`text-6xl font-black ${numColors[i]} block mb-5 select-none`}>{step.num}</span>
                    <h3 className="text-xl font-black text-gray-900 mb-3">{step.title}</h3>
                    <p className="text-base text-gray-400 leading-relaxed">{step.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════ ALSO COVERS ═══════════════════ */}
      <section className="py-20 px-6 lg:px-8 bg-gray-50/80">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Packaging', detail: 'Create packages, track lab testing, manage compliance tags and inventory.', border: 'border-l-emerald-500' },
              { label: 'Extraction', detail: 'Fresh frozen to bubble hash to rosin to carts. Full pipeline yield tracking.', border: 'border-l-blue-500' },
              { label: 'Voice Commands', detail: 'Hands-free operation with ambient mode. Log weights and create tasks by speaking.', border: 'border-l-amber-500' },
              { label: 'Task Management', detail: 'AI creates operational tasks from conversation. Track physical and digital workflows.', border: 'border-l-red-400' },
            ].map((cap, i) => (
              <Reveal key={cap.label} delay={i * 80}>
                <div className={`bg-white rounded-xl p-6 border border-gray-100 border-l-2 ${cap.border} hover:shadow-md transition-shadow`} style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <h3 className="text-sm font-black text-gray-900 mb-2">{cap.label}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{cap.detail}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ CLOSING CTA — dark, bold ═══════════════════ */}
      <section className="relative py-28 lg:py-36 px-6 lg:px-8 bg-gray-950 overflow-hidden">
        {/* Green glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(59,181,112,0.12) 0%, transparent 70%)' }} />
        {/* Grid pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
        <Reveal>
          <div className="max-w-7xl mx-auto text-center relative">
            <NeurocannLogo className="w-14 h-14 mx-auto mb-10" stroke="#3BB570" />
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight mb-5">
              Grown from necessity.
              <br />
              <span className="text-emerald-400">Cultivated for cannabis.</span>
            </h2>
            <p className="text-lg text-gray-400 max-w-lg mx-auto mb-12">
              Built by operators who&apos;ve managed rooms, run harvests, and trimmed alongside their crews. NeuroCann is the tool we wished we had.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="mailto:will@neurocann.com?subject=NeuroCann%20Demo%20Request"
                className="group bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-10 py-4.5 rounded-xl transition-all text-sm inline-block shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40"
              >
                Book a Demo
                <span className="inline-block ml-2 transition-transform group-hover:translate-x-0.5">&rarr;</span>
              </a>
              <button
                onClick={() => login()}
                className="border-2 border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-bold px-10 py-4.5 rounded-xl transition-all text-sm"
              >
                Sign In
              </button>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ═══════════════════ FOOTER ═══════════════════ */}
      <footer className="bg-gray-950 border-t border-gray-800 py-10 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <NeurocannLogo className="w-5 h-5" stroke="#4B5563" />
            <span className="text-sm font-bold text-gray-600 tracking-tight">
              neuro<span className="text-gray-700">cann</span>
            </span>
          </div>
          <p className="text-xs text-gray-600">
            &copy; {new Date().getFullYear()} NeuroCann. All rights reserved.
          </p>
        </div>
      </footer>

      {/* ═══════════════════ Keyframes ═══════════════════ */}
      <style>{`
        @keyframes pulse {
          0% { transform: scaleY(0.6); }
          100% { transform: scaleY(1); }
        }
        @keyframes heroFadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
