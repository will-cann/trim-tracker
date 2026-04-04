import { useState, useEffect, useCallback } from 'react';
import { Plus, BookOpen, Pencil, Trash2 } from 'lucide-react';
import type { ProcessTemplate, SOPDomain } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { CenteredSpinner } from '../Spinner';
import { CultivationSOPBuilder } from '../Cultivation/CultivationSOPBuilder';
import { PHASE_LABELS } from '../Cultivation/cultivationSOPAdapter';

// ── Domain tab config ───────────────────────────────────────────────────────

const DOMAIN_TABS: { domain: SOPDomain; label: string; color: string }[] = [
    { domain: 'cultivation', label: 'Cultivation', color: '#3BB570' },
    { domain: 'extraction', label: 'Extraction', color: '#1C9EFF' },
    { domain: 'processing', label: 'Processing', color: '#FA9E52' },
    { domain: 'compliance', label: 'Compliance', color: '#DF5B59' },
    { domain: 'facility', label: 'Facility', color: '#959595' },
];

// ── Component ───────────────────────────────────────────────────────────────

export function SOPsDashboard() {
    const [domain, setDomain] = useState<SOPDomain>('cultivation');
    const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
    const [loading, setLoading] = useState(true);

    // Editor state
    const [editing, setEditing] = useState<ProcessTemplate | 'new' | null>(null);

    // Fetch templates for current domain
    const loadTemplates = useCallback(async () => {
        setLoading(true);
        try {
            const all = await apiService.getProcessTemplates(domain);
            setTemplates(all);
        } catch (e) {
            console.error('Failed to load SOPs:', e);
        } finally {
            setLoading(false);
        }
    }, [domain]);

    useEffect(() => { loadTemplates(); }, [loadTemplates]);

    // Delete handler
    const handleDelete = async (id: string) => {
        try {
            await apiService.deleteProcessTemplate(id);
            loadTemplates();
        } catch (e) {
            console.error('Failed to delete SOP:', e);
        }
    };

    // ── If editing, show the builder ────────────────────────────────────────
    if (editing !== null && domain === 'cultivation') {
        return (
            <CultivationSOPBuilder
                initialTemplate={editing === 'new' ? undefined : editing}
                onBack={() => setEditing(null)}
                onSaved={() => { setEditing(null); loadTemplates(); }}
            />
        );
    }

    // ── List view ───────────────────────────────────────────────────────────
    return (
        <div className="sops-dashboard">
            <div className="sops-dashboard-header">
                <div className="sops-dashboard-title">
                    <BookOpen size={22} color="#3BB570" />
                    <h1>SOPs</h1>
                </div>
                <button className="btn-primary" onClick={() => setEditing('new')}>
                    <Plus size={14} /> New SOP
                </button>
            </div>

            {/* Domain tabs */}
            <div className="sops-domain-tabs">
                {DOMAIN_TABS.map(tab => (
                    <button
                        key={tab.domain}
                        className={`sops-domain-tab ${domain === tab.domain ? 'active' : ''}`}
                        onClick={() => { setDomain(tab.domain); setEditing(null); }}
                    >
                        <span className="sops-domain-dot" style={{ background: tab.color }} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Template list */}
            {loading ? (
                <CenteredSpinner />
            ) : templates.length === 0 ? (
                <div className="sops-empty">
                    <BookOpen size={32} color="#C0C0C0" />
                    <p>No {domain} SOPs yet</p>
                    <button className="btn-primary" onClick={() => setEditing('new')}>
                        <Plus size={14} /> New {domain} SOP
                    </button>
                </div>
            ) : (
                <div className="sops-list">
                    {templates.map(t => (
                        <div key={t.id} className="sops-card" onClick={() => setEditing(t)}>
                            <div className="sops-card-main">
                                <div className="sops-card-title">{t.name}</div>
                                {t.description && <div className="sops-card-desc">{t.description}</div>}
                                <div className="sops-card-meta">
                                    {t.phaseDurations && (
                                        <span className="sops-card-phases">
                                            {Object.entries(t.phaseDurations)
                                                .filter(([, w]) => w > 0)
                                                .map(([p, w]) => `${PHASE_LABELS[p] ?? p} ${w}w`)
                                                .join(' / ')}
                                        </span>
                                    )}
                                    <span className="sops-card-steps">{t.steps.length} events</span>
                                    {t.isPreset && <span className="sops-card-badge">Preset</span>}
                                </div>
                            </div>
                            <div className="sops-card-actions" onClick={e => e.stopPropagation()}>
                                <button className="btn-ghost" onClick={() => setEditing(t)} title="Edit">
                                    <Pencil size={14} />
                                </button>
                                {!t.isPreset && (
                                    <button className="btn-ghost" onClick={() => handleDelete(t.id)} title="Delete">
                                        <Trash2 size={14} color="#DF5B59" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
