import React from 'react';
import { ArrowRight } from 'lucide-react';
import { StartSession } from './StartSession';
import type { CreateTrimSessionDTO } from '../types/definitions';
import logo from '../assets/logo.png';

interface AIAssistantProps {
    onStart: (dto: CreateTrimSessionDTO) => void;
    onNavigateToAI?: () => void;
    trimmerProfiles?: any[];
    onSessionUpdate?: () => Promise<void>;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ onStart, onNavigateToAI }) => {
    return (
        <div className="card" style={{ maxWidth: 480, margin: '2rem auto', textAlign: 'center' }}>
            <div className="flex flex-col items-center gap-4 py-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                    <img src={logo} alt="Neurocann" className="w-10 h-10 object-contain" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-gray-800 mb-1">No Active Session</h2>
                    <p className="text-sm text-gray-500">
                        Start a new trim session using the AI assistant or the manual form below.
                    </p>
                </div>

                {onNavigateToAI && (
                    <button
                        onClick={onNavigateToAI}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-xl
                                   hover:bg-emerald-600 transition-colors font-medium text-sm"
                    >
                        Start with AI
                        <ArrowRight size={16} />
                    </button>
                )}

                <div className="w-full border-t border-gray-200 pt-4 mt-2">
                    <p className="text-xs text-gray-400 mb-3">Or use the manual form</p>
                    <StartSession onStart={onStart} />
                </div>
            </div>
        </div>
    );
};
