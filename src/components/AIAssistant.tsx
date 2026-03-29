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
        <div className="flex flex-col items-center justify-center flex-1 min-h-0 py-12 px-4">
            <div className="w-full max-w-md">
                {/* Empty state header */}
                <div className="text-center mb-8">
                    <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                        <Scissors size={20} className="text-gray-400" />
                    </div>
                    <h2 className="text-base font-semibold text-gray-800 mb-1">No Active Session</h2>
                    <p className="text-sm text-gray-400">
                        Start a trim session to begin tracking batches and trimmer output.
                    </p>
                </div>

                {/* AI shortcut */}
                {onNavigateToAI && (
                    <button
                        onClick={onNavigateToAI}
                        className="w-full flex items-center justify-between px-4 py-3 mb-6
                                   rounded-lg border border-gray-200 bg-white
                                   hover:border-emerald-300 hover:bg-emerald-50/40
                                   transition-colors group"
                    >
                        <div className="text-left">
                            <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-700">
                                Start with AI
                            </span>
                            <span className="block text-xs text-gray-400 mt-0.5">
                                Describe your session and let AI set it up
                            </span>
                        </div>
                        <ArrowRight size={16} className="text-gray-300 group-hover:text-emerald-500 transition-colors" />
                    </button>
                )}

                {/* Divider */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 font-medium">or manually</span>
                    <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* Form */}
                <StartSession onStart={onStart} />
            </div>
        </div>
    );
};
