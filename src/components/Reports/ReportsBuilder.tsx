import React, { useState, useEffect, useCallback } from 'react';
import { Bookmark, X, Loader2, AlertTriangle } from 'lucide-react';
import { apiService } from '../../services/apiService';
import type { ReportSpec, SavedReport } from '../../types/definitions';
import { DynamicChart } from './DynamicChart';
import { ReportPromptBar } from './ReportPromptBar';
import { SavedReportCard } from './SavedReportCard';
import { Modal } from '../ui/Modal';

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
      // silent
    }
  }, [activeReport, saveTitle, saveDescription]);

  const handleSelectSaved = useCallback(async (report: SavedReport) => {
    setIsGenerating(true);
    setError(null);
    try {
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
      // silent
    }
  }, []);

  const handleDelete = useCallback(async (report: SavedReport) => {
    try {
      await apiService.deleteReport(report.id);
      setSavedReports(prev => prev.filter(r => r.id !== report.id));
    } catch {
      // silent
    }
  }, []);

  const handleClear = () => {
    setActiveReport(null);
    setError(null);
    setConversationHistory([]);
  };

  return (
    <div className="reports-builder">
      <ReportPromptBar
        onSubmit={handleGenerate}
        isLoading={isGenerating}
        hasResult={!!activeReport}
      />

      {error && (
        <div className="report-error">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {isGenerating && !activeReport && (
        <div className="report-card">
          <div className="report-loading">
            <Loader2 size={18} className="report-loading-spinner" />
            <span>Analyzing your data...</span>
          </div>
          <div className="report-loading-skeleton">
            <div className="report-skeleton-bar" style={{ width: '33%' }} />
            <div className="report-skeleton-block" />
          </div>
        </div>
      )}

      {activeReport && (
        <div className="report-card">
          <div className="report-card-header">
            <div>
              <h3 className="report-card-title">{activeReport.spec.title}</h3>
              <p className="report-card-desc">{activeReport.spec.description}</p>
            </div>
            <div className="report-card-header-actions">
              <button
                onClick={() => {
                  setSaveTitle(activeReport.spec.title);
                  setSaveDescription(activeReport.spec.description);
                  setShowSaveModal(true);
                }}
                className="btn-ghost"
                style={{ fontSize: '0.75rem', gap: 4 }}
              >
                <Bookmark size={13} />
                Save
              </button>
              <button onClick={handleClear} className="close-btn">
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="report-card-body">
            <DynamicChart spec={activeReport.spec} data={activeReport.data} />
          </div>
          <div className="report-card-footer">
            {activeReport.data.length} row{activeReport.data.length !== 1 ? 's' : ''} · {activeReport.spec.visualization} chart
          </div>
        </div>
      )}

      {showSaveModal && (
        <Modal
          title="Save Report"
          onClose={() => setShowSaveModal(false)}
          footer={
            <>
              <button className="btn-cancel" onClick={() => setShowSaveModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={!saveTitle.trim()}>Save</button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">Title</label>
            <input
              className="field-input"
              type="text"
              value={saveTitle}
              onChange={e => setSaveTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label className="field-label">Description (optional)</label>
            <input
              className="field-input"
              type="text"
              value={saveDescription}
              onChange={e => setSaveDescription(e.target.value)}
            />
          </div>
        </Modal>
      )}

      {savedReports.length > 0 && (
        <div className="saved-reports-section">
          <h3 className="saved-reports-heading">Saved Reports</h3>
          <div className="saved-reports-grid">
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

      {!isLoadingSaved && savedReports.length === 0 && !activeReport && !isGenerating && (
        <div className="report-empty">
          Ask a question about your data to create your first report
        </div>
      )}
    </div>
  );
};
