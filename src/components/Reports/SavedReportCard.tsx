import React from 'react';
import { BarChart3, LineChart, PieChart, Table2, Hash, AreaChart, Layers, Pin, PinOff, Trash2 } from 'lucide-react';
import type { SavedReport } from '../../types/definitions';

const VIZ_ICONS: Record<string, React.ReactNode> = {
  bar: <BarChart3 size={16} />,
  line: <LineChart size={16} />,
  area: <AreaChart size={16} />,
  composed: <Layers size={16} />,
  pie: <PieChart size={16} />,
  table: <Table2 size={16} />,
  metric: <Hash size={16} />,
};

interface SavedReportCardProps {
  report: SavedReport;
  onSelect: (report: SavedReport) => void;
  onTogglePin: (report: SavedReport) => void;
  onDelete: (report: SavedReport) => void;
}

export const SavedReportCard: React.FC<SavedReportCardProps> = ({ report, onSelect, onTogglePin, onDelete }) => {
  const icon = VIZ_ICONS[report.spec.visualization] || <BarChart3 size={16} />;
  const date = new Date(report.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div onClick={() => onSelect(report)} className="saved-report-card">
      <div className="saved-report-card-header">
        <div className="saved-report-card-title">
          <span className="saved-report-card-icon">{icon}</span>
          <h3>{report.title}</h3>
        </div>
        <div className="saved-report-card-actions">
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePin(report); }}
            title={report.pinned ? 'Unpin' : 'Pin'}
          >
            {report.pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(report); }}
            className="saved-report-delete"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {report.description && (
        <p className="saved-report-card-desc">{report.description}</p>
      )}
      <div className="saved-report-card-meta">
        <span>{report.spec.visualization}</span>
        <span>·</span>
        <span>{date}</span>
        {report.pinned && (
          <>
            <span>·</span>
            <Pin size={10} style={{ color: 'var(--primary-color)' }} />
          </>
        )}
      </div>
    </div>
  );
};
