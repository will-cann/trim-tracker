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
    <div className="report-prompt-bar">
      <form onSubmit={handleSubmit}>
        <div className="report-prompt-input">
          <Sparkles size={16} style={{ color: 'var(--primary-color)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={hasResult ? 'Refine this report or ask something new...' : 'Describe the report you want to see...'}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!value.trim() || isLoading}
            className="report-prompt-send"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </form>

      {!hasResult && !isLoading && (
        <div className="report-suggestions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              className="report-suggestion-chip"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
