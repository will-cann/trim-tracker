import React, { useState, useCallback, useRef } from 'react';
import { Mic, Square, Radio } from 'lucide-react';
import type { SpeechMode } from '../types/definitions';

interface VoicePillProps {
    isListening: boolean;
    mode: SpeechMode;
    onToggleListening: () => void;
    onSwitchMode: (mode: SpeechMode) => void;
    error?: string | null;
}

function WaveformBars() {
    return (
        <div className="voice-waveform">
            <span className="voice-bar" style={{ animationDelay: '0ms' }} />
            <span className="voice-bar" style={{ animationDelay: '150ms' }} />
            <span className="voice-bar" style={{ animationDelay: '300ms' }} />
        </div>
    );
}

export const VoicePill: React.FC<VoicePillProps> = ({
    isListening,
    mode,
    onToggleListening,
    onSwitchMode,
}) => {
    const [showModeMenu, setShowModeMenu] = useState(false);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const didLongPress = useRef(false);

    const handlePointerDown = useCallback(() => {
        didLongPress.current = false;
        longPressTimer.current = setTimeout(() => {
            didLongPress.current = true;
            setShowModeMenu(true);
        }, 500);
    }, []);

    const handlePointerUp = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        if (!didLongPress.current) {
            onToggleListening();
        }
    }, [onToggleListening]);

    const handlePointerLeave = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    const selectMode = (m: SpeechMode) => {
        onSwitchMode(m);
        setShowModeMenu(false);
    };

    return (
        <div className="relative">
            <button
                type="button"
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                className={`voice-pill ${isListening ? 'voice-pill-active' : ''} ${mode === 'ambient' && isListening ? 'voice-pill-ambient' : ''}`}
                title={isListening ? 'Stop recording' : `Voice input (hold for mode) · ${mode}`}
            >
                {isListening ? (
                    <>
                        {mode === 'ambient' ? (
                            <div className="voice-ambient-dots">
                                <span /><span /><span />
                            </div>
                        ) : (
                            <WaveformBars />
                        )}
                        <Square size={14} className="voice-pill-stop" />
                    </>
                ) : (
                    <Mic size={16} />
                )}
            </button>

            {/* Mode selector on long-press */}
            {showModeMenu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowModeMenu(false)} />
                    <div className="voice-mode-menu">
                        <button
                            onClick={() => selectMode('action')}
                            className={`voice-mode-option ${mode === 'action' ? 'active' : ''}`}
                        >
                            <Mic size={14} />
                            <div>
                                <span className="font-medium">Action</span>
                                <span className="text-xs text-gray-400 block">Speak → fills text → you send</span>
                            </div>
                        </button>
                        <button
                            onClick={() => selectMode('ambient')}
                            className={`voice-mode-option ${mode === 'ambient' ? 'active' : ''}`}
                        >
                            <Radio size={14} />
                            <div>
                                <span className="font-medium">Ambient</span>
                                <span className="text-xs text-gray-400 block">Continuous → auto-creates tasks</span>
                            </div>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
