import React from 'react';
import { BarChart3, LineChart, PieChart, Table2, Hash, AreaChart, Layers, Pin, PinOff, Trash2 } from 'lucide-react';
import type { SavedReport } from '../../types/definitions';

const VIZ_ICONS: Record<string, React.ReactNode> = {
  bar: <BarChart3 size={18} />,
  line: <LineChart size={18} />,
  area: <AreaChart size={18} />,
  composed: <Layers size={18} />,
  pie: <PieChart size={18} />,
  table: <Table2 size={18} />,
  metric: <Hash size={18} />,
};

interface SavedReportCardProps {
  report: SavedReport;
  onSelect: (report: SavedReport) => void;
  onTogglePin: (report: SavedReport) => void;
  onDelete: (report: SavedReport) => void;
}

export const SavedReportCard: React.FC<SavedReportCardProps> = ({ report, onSelect, onTogglePin, onDelete }) => {
  const icon = VIZ_ICONS[report.spec.visualization] || <BarChart3 size={18} />;
  const date = new Date(report.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div
      onClick={() => onSelect(report)}
      className="group bg-white/60 backdrop-blur-sm rounded-xl border border-white/40 p-4 hover:bg-white/80 hover:shadow-md transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-blue-500">
          {icon}
          <h3 className="text-sm font-semibold text-gray-800 line-clamp-1">{report.title}</h3>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePin(report); }}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title={report.pinned ? 'Unpin' : 'Pin'}
          >
            {report.pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(report); }}
            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {report.description && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-2">{report.description}</p>
      )}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className="capitalize">{report.spec.visualization}</span>
        <span>·</span>
        <span>{date}</span>
        {report.pinned && (
          <>
            <span>·</span>
            <Pin size={10} className="text-blue-400" />
          </>
        )}
      </div>
    </div>
  );
};
