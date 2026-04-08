import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Square, Play } from 'lucide-react';
import { useAmbient } from '../contexts/AmbientContext';

interface AmbientHeaderIndicatorProps {
    onNavigateToAI: () => void;
}

function formatElapsed(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Where the user dragged the pill to. Persisted across navigation and
// reloads so the user only has to find a good spot once per device.
const POSITION_STORAGE_KEY = 'neurocann.ambientPill.position';
// Distance the pointer must travel during a press before we treat it as
// a drag instead of a click. Anything below this is still a click on the
// underlying button.
const DRAG_THRESHOLD = 4;
// Inset from the viewport edge so the pill never gets dragged flush.
const VIEWPORT_PADDING = 8;

interface PillPosition {
    top: number;
    left: number;
}

function loadStoredPosition(): PillPosition | null {
    try {
        const raw = localStorage.getItem(POSITION_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PillPosition;
        if (typeof parsed.top !== 'number' || typeof parsed.left !== 'number') return null;
        return parsed;
    } catch {
        return null;
    }
}

function clampToViewport(pos: PillPosition, width: number, height: number): PillPosition {
    const maxLeft = window.innerWidth - width - VIEWPORT_PADDING;
    const maxTop = window.innerHeight - height - VIEWPORT_PADDING;
    return {
        left: Math.max(VIEWPORT_PADDING, Math.min(maxLeft, pos.left)),
        top: Math.max(VIEWPORT_PADDING, Math.min(maxTop, pos.top)),
    };
}

/**
 * Slim persistent pill visible on any view when an ambient session is
 * active. Shows the session state (listening/paused), elapsed time, and
 * capture count. Clicking the body navigates back to the AI home where
 * the full Action Center is rendered. The right-side control toggles
 * between Stop (while listening) and Resume (while paused) without
 * requiring the user to switch views.
 *
 * The whole pill is draggable — pointerdown anywhere on the pill body
 * starts a drag if the pointer moves more than DRAG_THRESHOLD pixels
 * before release. Position is persisted to localStorage so the user
 * only has to find a good spot once per device.
 */
export const AmbientHeaderIndicator: React.FC<AmbientHeaderIndicatorProps> = ({ onNavigateToAI }) => {
    const ambient = useAmbient();
    const pillRef = useRef<HTMLDivElement>(null);

    // null = use the default top:16px right:24px CSS positioning
    const [position, setPosition] = useState<PillPosition | null>(() => loadStoredPosition());
    const [isDragging, setIsDragging] = useState(false);

    // Drag state lives in refs so we don't re-render on every pointermove
    const dragStateRef = useRef<{
        startX: number;
        startY: number;
        originLeft: number;
        originTop: number;
        moved: boolean;
        pointerId: number;
    } | null>(null);

    // Re-clamp the stored position whenever the viewport resizes so the
    // pill doesn't end up offscreen after a window resize / orientation flip.
    useEffect(() => {
        if (!position) return;
        const handleResize = () => {
            const el = pillRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const clamped = clampToViewport(position, rect.width, rect.height);
            if (clamped.left !== position.left || clamped.top !== position.top) {
                setPosition(clamped);
                try {
                    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(clamped));
                } catch { /* ignore */ }
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [position]);

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        // Only start a drag from a primary button press — don't interfere
        // with right-click or middle-click.
        if (e.button !== 0) return;
        // If the user pressed on the stop/resume action button, let it
        // handle its own click without starting a drag.
        const target = e.target as HTMLElement;
        if (target.closest('.ambient-header-action')) return;
        const el = pillRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        dragStateRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            originLeft: rect.left,
            originTop: rect.top,
            moved: false,
            pointerId: e.pointerId,
        };
        // Capture the pointer so we still get move/up events even if the
        // pointer leaves the pill.
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const state = dragStateRef.current;
        if (!state || state.pointerId !== e.pointerId) return;
        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        // Once we've moved past the threshold this is a drag, not a click.
        if (!state.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
            state.moved = true;
            setIsDragging(true);
        }
        if (!state.moved) return;
        const el = pillRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const next = clampToViewport(
            { left: state.originLeft + dx, top: state.originTop + dy },
            rect.width,
            rect.height,
        );
        setPosition(next);
    }, []);

    const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const state = dragStateRef.current;
        if (!state || state.pointerId !== e.pointerId) return;
        const el = pillRef.current;
        try { el?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

        const wasDrag = state.moved;
        const upTarget = e.target as HTMLElement;
        dragStateRef.current = null;
        setIsDragging(false);

        if (wasDrag) {
            // Persist the new position so it survives navigation/reloads.
            // Read current position from state via a functional update to
            // avoid stale closure capture.
            setPosition(prev => {
                if (prev) {
                    try { localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(prev)); } catch { /* ignore */ }
                }
                return prev;
            });
            return;
        }

        // No drag — treat as a click. Navigate to AI home only if the
        // press ended on the body button (not on an action button or
        // outside the pill). Pointer capture can deliver pointerup to
        // the container instead of the original button, so we navigate
        // unless the release target was clearly an action button.
        if (upTarget.closest('.ambient-header-action')) return;
        onNavigateToAI();
    }, [onNavigateToAI]);

    if (!ambient.sessionActive) return null;

    const captureCount = ambient.captures.length;
    const pendingCount = ambient.pendingActions?.length || 0;

    // When position is set we use absolute coords; otherwise the CSS
    // default (top: 16px right: 24px) takes over.
    const positionStyle: React.CSSProperties | undefined = position
        ? { top: position.top, left: position.left, right: 'auto' }
        : undefined;

    return (
        <div
            ref={pillRef}
            className={`ambient-header-pill${ambient.isPaused ? ' paused' : ''}${isDragging ? ' dragging' : ''}`}
            style={positionStyle}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            <div
                className="ambient-header-body"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigateToAI(); } }}
                title="Drag to move · click to return to Action Center"
            >
                <span className={`ambient-header-dot${ambient.hasVoiceSignal ? ' hot' : ''}${ambient.isPaused ? ' paused' : ''}`} />
                <span className="ambient-header-label">
                    {ambient.isPaused ? 'Paused' : 'Listening'}
                </span>
                <span className="ambient-header-sep">·</span>
                <span className="ambient-header-timer tabular">{formatElapsed(ambient.elapsedMs)}</span>
                {captureCount > 0 && (
                    <>
                        <span className="ambient-header-sep">·</span>
                        <span className="ambient-header-count tabular">
                            {captureCount} captured
                        </span>
                    </>
                )}
                {pendingCount > 0 && (
                    <span className="ambient-header-review tabular">
                        {pendingCount} to review
                    </span>
                )}
            </div>
            {ambient.isPaused ? (
                <button
                    type="button"
                    className="ambient-header-action resume"
                    onClick={ambient.resume}
                    title="Resume listening"
                >
                    <Play size={11} fill="currentColor" />
                </button>
            ) : (
                <button
                    type="button"
                    className="ambient-header-action stop"
                    onClick={ambient.pause}
                    title="Stop mic (session stays open)"
                >
                    <Square size={10} fill="currentColor" />
                </button>
            )}
        </div>
    );
};
