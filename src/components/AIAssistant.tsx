import React from 'react';
import { ArrowRight, Scissors } from 'lucide-react';
import { StartSession } from './StartSession';
import type { CreateTrimSessionDTO } from '../types/definitions';

interface AIAssistantProps {
    onStart: (dto: CreateTrimSessionDTO) => void;
    onNavigateToAI?: () => void;
    trimmerProfiles?: any[];
    onSessionUpdate?: () => Promise<void>;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ onStart, onNavigateToAI }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 0, padding: '48px 16px' }}>
            <div style={{ width: '100%', maxWidth: 420 }}>
                {/* Empty state header */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: '#F1F1F1', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <Scissors size={20} color="#959595" />
                    </div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1A1A1A', marginBottom: 4 }}>No Active Session</h2>
                    <p style={{ fontSize: '0.875rem', color: '#959595' }}>
                        Start a trim session to begin tracking batches and trimmer output.
                    </p>
                </div>

                {/* AI shortcut */}
                {onNavigateToAI && (
                    <button
                        onClick={onNavigateToAI}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            marginBottom: 24,
                            borderRadius: 8,
                            border: '1px solid #E8E8E8',
                            background: '#fff',
                            cursor: 'pointer',
                            transition: 'border-color 0.15s ease, background 0.15s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#3BB570'; e.currentTarget.style.background = 'rgba(59, 181, 112, 0.04)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#E8E8E8'; e.currentTarget.style.background = '#fff'; }}
                    >
                        <div style={{ textAlign: 'left' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1A1A1A' }}>
                                Start with AI
                            </span>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: '#959595', marginTop: 2 }}>
                                Describe your session and let AI set it up
                            </span>
                        </div>
                        <ArrowRight size={16} color="#C0C0C0" />
                    </button>
                )}

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                    <div style={{ flex: 1, height: 1, background: '#E8E8E8' }} />
                    <span style={{ fontSize: '0.75rem', color: '#959595', fontWeight: 500 }}>or manually</span>
                    <div style={{ flex: 1, height: 1, background: '#E8E8E8' }} />
                </div>

                {/* Form */}
                <StartSession onStart={onStart} />
            </div>
        </div>
    );
};
