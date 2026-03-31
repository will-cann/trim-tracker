import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Circle, X, Loader2, ArrowRight, Snowflake, Droplets, Flame, Package, Send, ChevronDown } from 'lucide-react';
import { apiService } from '../services/apiService';
import type { Package as PackageType } from '../types/definitions';

export interface ExtractionRunCardData {
    id: string;
    createdAt: Date;
    strain: string | null;
    inputPackageType: string | null;
    inputQuantity: number | null;
    outputPackageType: string | null;
    outputQuantity: number | null;
    licenseNumber: string | null;
    sourcePackageId: string | null;
    outputLabel: string | null;
    wasteWeight: number | null;
    notes: string | null;
    status: 'filling' | 'ready' | 'submitting' | 'submitted' | 'error';
    lastUpdatedField: string | null;
    lastUpdatedAt: number;
}

const TYPE_LABELS: Record<string, string> = {
    fresh_frozen: 'Fresh Frozen',
    bubble_hash: 'Bubble Hash',
    rosin: 'Rosin',
    rosin_cart: 'Rosin Carts',
};

const TYPE_ICONS: Record<string, typeof Snowflake> = {
    fresh_frozen: Snowflake,
    bubble_hash: Droplets,
    rosin: Flame,
    rosin_cart: Package,
};

interface FieldDef {
    key: keyof ExtractionRunCardData;
    label: string;
    required: boolean;
    format?: (value: any) => string;
}

const FIELDS: FieldDef[] = [
    { key: 'strain', label: 'Strain', required: true },
    { key: 'inputPackageType', label: 'Input Type', required: true, format: v => TYPE_LABELS[v] || v },
    { key: 'inputQuantity', label: 'Input Qty', required: true, format: v => `${Number(v).toLocaleString()}g` },
    { key: 'outputPackageType', label: 'Output Type', required: true, format: v => TYPE_LABELS[v] || v },
    { key: 'outputQuantity', label: 'Output Qty', required: true, format: v => `${Number(v).toLocaleString()}g` },
    { key: 'licenseNumber', label: 'License', required: false },
];

export function isCardReady(card: ExtractionRunCardData): boolean {
    return !!(
        card.strain &&
        card.inputPackageType &&
        card.inputQuantity && card.inputQuantity > 0 &&
        card.outputPackageType &&
        card.outputQuantity && card.outputQuantity > 0
    );
}

interface ExtractionRunCardProps {
    card: ExtractionRunCardData;
    onSubmit: (id: string) => void;
    onDismiss: (id: string) => void;
    onUpdateCard: (id: string, updates: Partial<ExtractionRunCardData>) => void;
}

export const ExtractionRunCard: React.FC<ExtractionRunCardProps> = ({ card, onSubmit, onDismiss, onUpdateCard }) => {
    const [highlightField, setHighlightField] = useState<string | null>(null);
    const [sourcePackages, setSourcePackages] = useState<PackageType[]>([]);
    const [loadingPackages, setLoadingPackages] = useState(false);

    // Load matching source packages when input type + strain are known
    const loadSourcePackages = useCallback(async () => {
        if (!card.inputPackageType || !card.strain) return;
        setLoadingPackages(true);
        try {
            const allPkgs = await apiService.getPackages();
            const matching = allPkgs.filter(p =>
                p.packageType === card.inputPackageType &&
                p.strain.toLowerCase() === card.strain!.toLowerCase() &&
                p.status === 'active' &&
                p.quantity > 0
            );
            setSourcePackages(matching);
            // Auto-select if only one match
            if (matching.length === 1 && !card.sourcePackageId) {
                onUpdateCard(card.id, { sourcePackageId: matching[0].id });
            }
        } catch { /* silent */ }
        setLoadingPackages(false);
    }, [card.inputPackageType, card.strain, card.id, card.sourcePackageId, onUpdateCard]);

    useEffect(() => {
        loadSourcePackages();
    }, [loadSourcePackages]);

    // Flash highlight when a field updates
    useEffect(() => {
        if (card.lastUpdatedField) {
            setHighlightField(card.lastUpdatedField);
            const timer = setTimeout(() => setHighlightField(null), 1500);
            return () => clearTimeout(timer);
        }
    }, [card.lastUpdatedField, card.lastUpdatedAt]);

    const yieldPct = card.inputQuantity && card.outputQuantity
        ? ((card.outputQuantity / card.inputQuantity) * 100).toFixed(1)
        : null;

    const InputIcon = card.inputPackageType ? (TYPE_ICONS[card.inputPackageType] || Package) : null;
    const OutputIcon = card.outputPackageType ? (TYPE_ICONS[card.outputPackageType] || Package) : null;

    const isReady = isCardReady(card);
    const isSubmitted = card.status === 'submitted';
    const isSubmitting = card.status === 'submitting';

    return (
        <div style={{
            background: isSubmitted ? 'rgba(59, 181, 112, 0.04)' : 'white',
            border: isSubmitted ? '1.5px solid rgba(59, 181, 112, 0.3)' : '1.5px solid #E8E8E8',
            borderRadius: '12px',
            overflow: 'hidden',
            transition: 'border-color 0.2s, background 0.2s',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderBottom: '1px solid #F0F0F0',
                background: isSubmitted ? 'rgba(59, 181, 112, 0.06)' : '#FAFAFA',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {InputIcon && OutputIcon ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <InputIcon size={14} style={{ color: '#959595' }} />
                            <ArrowRight size={10} style={{ color: '#C0C0C0' }} />
                            <OutputIcon size={14} style={{ color: '#3BB570' }} />
                        </div>
                    ) : (
                        <Droplets size={14} style={{ color: '#FA9E52' }} />
                    )}
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#2D2D2D' }}>
                        {isSubmitted ? 'Extraction Submitted' : 'Extraction Run'}
                    </span>
                    {card.strain && (
                        <span style={{ fontSize: '12px', color: '#959595', fontWeight: 500 }}>
                            {card.strain}
                        </span>
                    )}
                </div>
                {!isSubmitting && (
                    <button
                        onClick={() => onDismiss(card.id)}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px',
                            color: '#C0C0C0',
                            display: 'flex',
                        }}
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* Field checklist */}
            <div style={{ padding: '8px 14px' }}>
                {FIELDS.map(field => {
                    const value = card[field.key];
                    const isFilled = value !== null && value !== undefined && value !== '';
                    const isHighlighted = highlightField === field.key;

                    return (
                        <div
                            key={field.key}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 4px',
                                borderRadius: '6px',
                                background: isHighlighted ? 'rgba(59, 181, 112, 0.08)' : 'transparent',
                                transition: 'background 0.3s ease-out',
                            }}
                        >
                            {/* Status icon */}
                            {isFilled ? (
                                <CheckCircle2 size={14} style={{ color: '#3BB570', flexShrink: 0 }} />
                            ) : (
                                <Circle size={14} style={{ color: field.required ? '#C0C0C0' : '#E0E0E0', flexShrink: 0 }} />
                            )}

                            {/* Label */}
                            <span style={{
                                fontSize: '12px',
                                fontWeight: 500,
                                color: isFilled ? '#6B6B6B' : (field.required ? '#ABABAB' : '#D0D0D0'),
                                width: '80px',
                                flexShrink: 0,
                            }}>
                                {field.label}
                            </span>

                            {/* Value */}
                            <span style={{
                                fontSize: '13px',
                                fontWeight: isFilled ? 600 : 400,
                                color: isFilled ? '#2D2D2D' : '#D0D0D0',
                            }}>
                                {isFilled
                                    ? (field.format ? field.format(value) : String(value))
                                    : '—'
                                }
                            </span>
                        </div>
                    );
                })}

                {/* Source package picker */}
                {card.inputPackageType && card.strain && sourcePackages.length > 0 && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 4px',
                        marginTop: '2px',
                        borderTop: '1px solid #F0F0F0',
                    }}>
                        {card.sourcePackageId ? (
                            <CheckCircle2 size={14} style={{ color: '#3BB570', flexShrink: 0 }} />
                        ) : (
                            <Circle size={14} style={{ color: '#C0C0C0', flexShrink: 0 }} />
                        )}
                        <span style={{ fontSize: '12px', fontWeight: 500, color: '#6B6B6B', width: '80px', flexShrink: 0 }}>
                            Source Pkg
                        </span>
                        {loadingPackages ? (
                            <Loader2 size={12} className="animate-spin" style={{ color: '#C0C0C0' }} />
                        ) : (
                            <div style={{ position: 'relative', flex: 1 }}>
                                <select
                                    value={card.sourcePackageId || ''}
                                    onChange={(e) => onUpdateCard(card.id, { sourcePackageId: e.target.value || null })}
                                    style={{
                                        width: '100%',
                                        fontSize: '12px',
                                        fontWeight: 500,
                                        color: card.sourcePackageId ? '#2D2D2D' : '#ABABAB',
                                        padding: '4px 8px',
                                        paddingRight: '24px',
                                        borderRadius: '6px',
                                        border: '1px solid #E5E5E5',
                                        background: 'white',
                                        fontFamily: 'inherit',
                                        appearance: 'none',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <option value="">Select source...</option>
                                    {sourcePackages.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.label} — {p.quantity.toLocaleString()}g
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={12} style={{
                                    position: 'absolute',
                                    right: '8px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: '#C0C0C0',
                                    pointerEvents: 'none',
                                }} />
                            </div>
                        )}
                    </div>
                )}

                {/* Yield percentage */}
                {yieldPct && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 4px',
                        marginTop: '2px',
                        borderTop: '1px solid #F0F0F0',
                    }}>
                        <span style={{ width: '22px' }} />
                        <span style={{ fontSize: '12px', fontWeight: 500, color: '#959595', width: '80px' }}>Yield</span>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#FA9E52' }}>{yieldPct}%</span>
                    </div>
                )}
            </div>

            {/* Submit / Status footer */}
            {!isSubmitted && (
                <div style={{
                    padding: '8px 14px 12px',
                    borderTop: '1px solid #F0F0F0',
                }}>
                    <button
                        onClick={() => onSubmit(card.id)}
                        disabled={!isReady || isSubmitting}
                        style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            fontFamily: 'inherit',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: isReady && !isSubmitting ? 'pointer' : 'default',
                            background: isReady ? '#FA9E52' : '#F0F0F0',
                            color: isReady ? 'white' : '#C0C0C0',
                            transition: 'background 0.15s, color 0.15s',
                            opacity: isSubmitting ? 0.7 : 1,
                        }}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                Submitting...
                            </>
                        ) : (
                            <>
                                <Send size={13} />
                                Submit Extraction
                            </>
                        )}
                    </button>
                    {card.status === 'error' && (
                        <p style={{ fontSize: '11px', color: '#DF5B59', textAlign: 'center', marginTop: '6px' }}>
                            Submission failed — try again
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
