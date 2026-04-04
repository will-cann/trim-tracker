import React, { useState, useRef } from 'react';
import { Send, Sparkles, Loader2 } from 'lucide-react';

const SUGGESTIONS = [
  'Total harvest weight by strain this quarter',
  'Trimmer productivity (grams/hour) by person',
  'Extraction yield percentage by strain',
  'Package inventory breakdown by type',
  'Task completion rate by category',
  'Plant count by room and growth phase',
];

interface ReportPromptBarProps {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
  hasResult: boolean;
}

export const ReportPromptBar: React.FC<ReportPromptBarProps> = ({ onSubmit, isLoading, hasResult }) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed);
  };

  const handleSuggestion = (text: string) => {
    if (isLoading) return;
    setValue(text);
    onSubmit(text);
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center gap-2 bg-white/70 backdrop-blur-sm rounded-xl border border-white/40 shadow-sm px-4 py-2 focus-within:ring-2 focus-within:ring-blue-300/50 transition-all">
          <Sparkles size={18} className="text-blue-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={hasResult ? 'Refine this report or ask something new...' : 'Describe the report you want to see...'}
            className="flex-1 bg-transparent outline-none text-gray-700 placeholder:text-gray-400 text-sm"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!value.trim() || isLoading}
            className="p-1.5 rounded-lg bg-blue-500 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </form>

      {!hasResult && !isLoading && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              className="text-xs px-3 py-1.5 rounded-full bg-white/50 border border-white/40 text-gray-600 hover:bg-white/80 hover:text-gray-800 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
