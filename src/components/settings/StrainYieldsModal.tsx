import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { Modal } from '../ui';
import type { Strain, StrainYieldOverride, ProcessTemplate, ProductType } from '../../types/definitions';
import { apiService } from '../../services/apiService';

// ─────────────────────────────────────────────────────────────────────────────
// StrainYieldsModal — manual per-strain yield overrides for the planner.
//
// Operators know their numbers by heart ("GMO washes at 7%, White Fire at 4.5%"),
// and the planner respects those before falling back to historical averages or
// template defaults. This modal is where those numbers live.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    strain: Strain;
    templates: ProcessTemplate[];
    productTypes: ProductType[];
    onClose: () => void;
}

// Derive the canonical (inputType, outputType) pair for a template.
// inputType = first required step's input, falling back to acceptedInputs[0].
// outputType = user pick among producibleOutputs (auto-pick when there's just one).
function firstInputFor(tmpl: ProcessTemplate): string | null {
    const firstStep = tmpl.steps?.find(s => !s.isOptional);
    return firstStep?.inputType || tmpl.acceptedInputs?.[0] || null;
}

export const StrainYieldsModal: React.FC<Props> = ({ strain, templates, productTypes, onClose }) => {
    const [overrides, setOverrides] = useState<StrainYieldOverride[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Draft row state
    const [draftTemplateId, setDraftTemplateId] = useState('');
    const [draftOutput, setDraftOutput] = useState('');
    const [draftPct, setDraftPct] = useState('');

    const productByName = useMemo(() => {
        const m = new Map<string, ProductType>();
        for (const pt of productTypes) m.set(pt.name, pt);
        return m;
    }, [productTypes]);

    const displayProduct = (name: string) =>
        productByName.get(name)?.displayName || name.replace(/_/g, ' ');

    // Extraction-domain SOPs only. Sorted by name for a stable picker.
    const extractionTemplates = useMemo(
        () => templates
            .filter(t => t.isActive && t.domain === 'extraction' && (t.producibleOutputs?.length ?? 0) > 0)
            .sort((a, b) => a.name.localeCompare(b.name)),
        [templates]
    );

    const selectedTemplate = extractionTemplates.find(t => t.id === draftTemplateId);
    const availableOutputs = selectedTemplate?.producibleOutputs || [];
    const draftInput = selectedTemplate ? firstInputFor(selectedTemplate) : null;

    // Auto-pick the single output when there's only one so the user never has to.
    useEffect(() => {
        if (availableOutputs.length === 1 && draftOutput !== availableOutputs[0]) {
            setDraftOutput(availableOutputs[0]);
        } else if (availableOutputs.length !== 1 && !availableOutputs.includes(draftOutput)) {
            setDraftOutput('');
        }
    }, [draftTemplateId, availableOutputs, draftOutput]);

    const loadOverrides = async () => {
        try {
            const data = await apiService.getStrainYields({ strain: strain.name });
            setOverrides(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load yields');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOverrides();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [strain.name]);

    const canSaveDraft =
        draftTemplateId && draftOutput && draftInput && draftPct &&
        !Number.isNaN(parseFloat(draftPct)) && parseFloat(draftPct) > 0 && parseFloat(draftPct) <= 100;

    const handleAddDraft = async () => {
        if (!canSaveDraft || !draftInput) return;
        setSaving(true);
        setError(null);
        try {
            await apiService.saveStrainYield({
                strain: strain.name,
                templateId: draftTemplateId,
                inputType: draftInput,
                outputType: draftOutput,
                yieldPct: parseFloat(draftPct),
            });
            setDraftTemplateId('');
            setDraftOutput('');
            setDraftPct('');
            await loadOverrides();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to save yield');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateYield = async (override: StrainYieldOverride, raw: string) => {
        const pct = parseFloat(raw);
        if (Number.isNaN(pct) || pct < 0 || pct > 100) return;
        if (pct === override.yieldPct) return;
        try {
            await apiService.saveStrainYield({
                id: override.id,
                strain: override.strain,
                templateId: override.templateId,
                inputType: override.inputType,
                outputType: override.outputType,
                yieldPct: pct,
            });
            await loadOverrides();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to update yield');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await apiService.deleteStrainYield(id);
            await loadOverrides();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to delete yield');
        }
    };

    return (
        <Modal
            title={<>Known yields <span className="strain-yields-strain">{strain.name}</span></>}
            onClose={onClose}
            contentClassName="strain-yields-modal"
            size="lg"
        >
            <div className="strain-yields">
                <p className="strain-yields-hint">
                    Record yields you've seen running <strong>{strain.name}</strong> on specific SOPs.
                    The planner checks these before historical averages and template defaults — so
                    if GMO washes at 7% and White Fire lands at 4.5%, type those in and the biomass
                    math stops lying.
                </p>

                {error && (
                    <div className="planning-error" style={{ marginBottom: '0.75rem' }}>
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="strain-yields-loading">
                        <Loader2 size={16} className="animate-spin" /> Loading…
                    </div>
                ) : (
                    <table className="strain-yields-table">
                        <thead>
                            <tr>
                                <th>SOP</th>
                                <th>Input → Output</th>
                                <th style={{ width: 90 }}>Yield</th>
                                <th style={{ width: 32 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {overrides.length === 0 && (
                                <tr className="strain-yields-empty-row">
                                    <td colSpan={4}>No yields recorded yet.</td>
                                </tr>
                            )}
                            {overrides.map(o => (
                                <tr key={o.id}>
                                    <td className="strain-yields-tmpl">{o.templateName}</td>
                                    <td className="strain-yields-inout">
                                        {displayProduct(o.inputType)} → {displayProduct(o.outputType)}
                                    </td>
                                    <td>
                                        <div className="strain-yields-pct-wrap">
                                            <input
                                                type="number"
                                                className="strain-yields-pct-input"
                                                defaultValue={o.yieldPct}
                                                min="0"
                                                max="100"
                                                step="0.1"
                                                onBlur={e => handleUpdateYield(o, e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                            />
                                            <span className="strain-yields-pct-sign">%</span>
                                        </div>
                                    </td>
                                    <td>
                                        <button
                                            className="strain-yields-delete"
                                            onClick={() => handleDelete(o.id)}
                                            aria-label={`Remove override for ${o.templateName}`}
                                        >
                                            <X size={12} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {/* Draft row */}
                            <tr className="strain-yields-draft-row">
                                <td>
                                    <select
                                        className="strain-yields-draft-select"
                                        value={draftTemplateId}
                                        onChange={e => setDraftTemplateId(e.target.value)}
                                    >
                                        <option value="">Choose SOP…</option>
                                        {extractionTemplates.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </td>
                                <td>
                                    {selectedTemplate && draftInput ? (
                                        availableOutputs.length > 1 ? (
                                            <select
                                                className="strain-yields-draft-select"
                                                value={draftOutput}
                                                onChange={e => setDraftOutput(e.target.value)}
                                            >
                                                <option value="">Choose output…</option>
                                                {availableOutputs.map(o => (
                                                    <option key={o} value={o}>{displayProduct(draftInput)} → {displayProduct(o)}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className="strain-yields-inout">
                                                {displayProduct(draftInput)} → {draftOutput ? displayProduct(draftOutput) : '—'}
                                            </span>
                                        )
                                    ) : (
                                        <span className="strain-yields-inout strain-yields-inout--dim">pick a SOP</span>
                                    )}
                                </td>
                                <td>
                                    <div className="strain-yields-pct-wrap">
                                        <input
                                            type="number"
                                            className="strain-yields-pct-input"
                                            placeholder="0"
                                            value={draftPct}
                                            min="0"
                                            max="100"
                                            step="0.1"
                                            onChange={e => setDraftPct(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter' && canSaveDraft) handleAddDraft(); }}
                                        />
                                        <span className="strain-yields-pct-sign">%</span>
                                    </div>
                                </td>
                                <td>
                                    <button
                                        className="strain-yields-add"
                                        onClick={handleAddDraft}
                                        disabled={!canSaveDraft || saving}
                                        aria-label="Add yield override"
                                    >
                                        {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                )}
            </div>
        </Modal>
    );
};
