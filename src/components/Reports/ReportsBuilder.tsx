import React, { useState, useEffect, useCallback } from 'react';
import { Bookmark, X, Loader2 } from 'lucide-react';
import { apiService } from '../../services/apiService';
import type { ReportSpec, SavedReport } from '../../types/definitions';
import { DynamicChart } from './DynamicChart';
import { ReportPromptBar } from './ReportPromptBar';
import { SavedReportCard } from './SavedReportCard';

interface ActiveReport {
  spec: ReportSpec;
  data: Record<string, any>[];
  prompt: string;
}

export const ReportsBuilder: React.FC = () => {
  const [activeReport, setActiveReport] = useState<ActiveReport | null>(null);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: string; content: string }>>([]);

  // Load saved reports on mount
  useEffect(() => {
    apiService.getSavedReports()
      .then(setSavedReports)
      .catch(() => {})
      .finally(() => setIsLoadingSaved(false));
  }, []);

  const handleGenerate = useCallback(async (prompt: string) => {
    setIsGenerating(true);
    setError(null);

    try {
      const result = await apiService.generateReport(prompt, conversationHistory);

      // Update conversation history for follow-up refinements
      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: prompt },
        { role: 'assistant', content: result.message || `Generated report: ${result.spec?.title || 'Report'}` },
      ]);

      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.spec && result.data) {
        setActiveReport({ spec: result.spec, data: result.data, prompt });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
  }, [conversationHistory]);

  const handleSave = useCallback(async () => {
    if (!activeReport || !saveTitle.trim()) return;
    try {
      const saved = await apiService.saveReport({
        title: saveTitle.trim(),
        description: saveDescription.trim() || undefined,
        spec: activeReport.spec,
      });
      setSavedReports(prev => [saved, ...prev]);
      setShowSaveModal(false);
      setSaveTitle('');
      setSaveDescription('');
    } catch {
      // save failed silently
    }
  }, [activeReport, saveTitle, saveDescription]);

  const handleSelectSaved = useCallback(async (report: SavedReport) => {
    setIsGenerating(true);
    setError(null);
    try {
      // Re-execute the saved spec by generating from its original description
      const result = await apiService.generateReport(
        `Generate the exact same report: ${report.spec.title}. ${report.spec.description}`
      );
      if (result.spec && result.data) {
        setActiveReport({ spec: result.spec, data: result.data, prompt: report.title });
        setConversationHistory([]);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load report');
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const handleTogglePin = useCallback(async (report: SavedReport) => {
    try {
      const updated = await apiService.saveReport({
        id: report.id,
        title: report.title,
        description: report.description || undefined,
        spec: report.spec,
        pinned: !report.pinned,
      });
      setSavedReports(prev =>
        prev.map(r => r.id === updated.id ? updated : r)
          .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
      );
    } catch {
      // pin toggle failed silently
    }
  }, []);

  const handleDelete = useCallback(async (report: SavedReport) => {
    try {
      await apiService.deleteReport(report.id);
      setSavedReports(prev => prev.filter(r => r.id !== report.id));
    } catch {
      // delete failed silently
    }
  }, []);

  const handleClear = () => {
    setActiveReport(null);
    setError(null);
    setConversationHistory([]);
  };

  return (
    <div className="space-y-6">
      {/* Prompt bar */}
      <ReportPromptBar
        onSubmit={handleGenerate}
        isLoading={isGenerating}
        hasResult={!!activeReport}
      />

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {isGenerating && !activeReport && (
        <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 p-8">
          <div className="flex items-center justify-center gap-3 text-gray-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Analyzing your data...</span>
          </div>
          <div className="mt-6 space-y-3 animate-pulse">
            <div className="h-4 bg-gray-200/50 rounded w-1/3" />
            <div className="h-64 bg-gray-200/30 rounded-xl" />
          </div>
        </div>
      )}

      {/* Active report */}
      {activeReport && (
        <div className="bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/30">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">{activeReport.spec.title}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{activeReport.spec.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSaveTitle(activeReport.spec.title);
                  setSaveDescription(activeReport.spec.description);
                  setShowSaveModal(true);
                }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
              >
                <Bookmark size={13} />
                Save
              </button>
              <button
                onClick={handleClear}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="p-5">
            <DynamicChart spec={activeReport.spec} data={activeReport.data} />
          </div>
          <div className="px-5 py-2 border-t border-white/30 text-xs text-gray-400">
            {activeReport.data.length} row{activeReport.data.length !== 1 ? 's' : ''} · {activeReport.spec.visualization} chart
          </div>
        </div>
      )}

      {/* Save modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowSaveModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Save Report</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                <input
                  type="text"
                  value={saveTitle}
                  onChange={e => setSaveTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-300/50 outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={saveDescription}
                  onChange={e => setSaveDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-300/50 outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!saveTitle.trim()}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved reports grid */}
      {savedReports.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-600 mb-3">Saved Reports</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedReports.map(report => (
              <SavedReportCard
                key={report.id}
                report={report}
                onSelect={handleSelectSaved}
                onTogglePin={handleTogglePin}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoadingSaved && savedReports.length === 0 && !activeReport && !isGenerating && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">Ask a question about your data to create your first report</p>
        </div>
      )}
    </div>
  );
};
