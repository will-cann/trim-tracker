import React from 'react';
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

/**
 * Slim persistent pill visible on any view when an ambient session is
 * active. Shows the session state (listening/paused), elapsed time, and
 * capture count. Clicking the body navigates back to the AI home where
 * the full Action Center is rendered. The right-side control toggles
 * between Stop (while listening) and Resume (while paused) without
 * requiring the user to switch views.
 */
export const AmbientHeaderIndicator: React.FC<AmbientHeaderIndicatorProps> = ({ onNavigateToAI }) => {
    const ambient = useAmbient();

    if (!ambient.sessionActive) return null;

    const captureCount = ambient.captures.length;
    const pendingCount = ambient.pendingActions?.length || 0;

    return (
        <div className={`ambient-header-pill${ambient.isPaused ? ' paused' : ''}`}>
            <button
                type="button"
                className="ambient-header-body"
                onClick={onNavigateToAI}
                title="Return to Action Center"
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
            </button>
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
