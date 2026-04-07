import React from 'react';
import { Square, Play, X } from 'lucide-react';

interface AmbientStatusPillProps {
    isPaused: boolean;
    hasVoiceSignal: boolean;
    elapsedMs: number;
    onPause: () => void;
    onResume: () => void;
    onEnd: () => void;
}

function formatElapsed(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Watch-face style status indicator for an active ambient session.
 * Lives in the AI home's brand block area, below the license selector.
 * Reads as one continuous control: state · timer · stop. Reverses to
 * resume + end when paused.
 */
export const AmbientStatusPill: React.FC<AmbientStatusPillProps> = ({
    isPaused,
    hasVoiceSignal,
    elapsedMs,
    onPause,
    onResume,
    onEnd,
}) => {
    return (
        <div className={`ambient-pill${isPaused ? ' paused' : ''}`}>
            <span className={`ambient-pill-dot${hasVoiceSignal ? ' hot' : ''}${isPaused ? ' paused' : ''}`} />
            <span className="ambient-pill-label">
                {isPaused ? 'Paused' : 'Listening'}
            </span>
            <span className="ambient-pill-rule" />
            <span className="ambient-pill-timer tabular">{formatElapsed(elapsedMs)}</span>
            <span className="ambient-pill-rule" />
            {isPaused ? (
                <>
                    <button
                        type="button"
                        className="ambient-pill-action resume"
                        onClick={onResume}
                        title="Resume listening"
                    >
                        <Play size={10} fill="currentColor" />
                        Resume
                    </button>
                    <button
                        type="button"
                        className="ambient-pill-end"
                        onClick={onEnd}
                        title="End session"
                    >
                        <X size={11} />
                    </button>
                </>
            ) : (
                <button
                    type="button"
                    className="ambient-pill-action stop"
                    onClick={onPause}
                    title="Stop listening (session stays open)"
                >
                    <Square size={9} fill="currentColor" />
                    Stop
                </button>
            )}
        </div>
    );
};
