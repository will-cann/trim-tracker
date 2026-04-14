import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Mail, Plus, X, Send } from 'lucide-react';
import type { Vendor, VendorProduct } from '../../types/definitions';
import { apiService } from '../../services/apiService';
import { ContactThreadTimeline, useVendorThreads, formatRelative } from './ContactThreadTimeline';

interface Props {
    vendorId: string;
    onBack: () => void;
}

const formatUnitPrice = (price: number | null): string => {
    if (price == null) return '--';
    return `$${price.toFixed(2)}`;
};

export const SupplierDetail: React.FC<Props> = ({ vendorId, onBack }) => {
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [products, setProducts] = useState<VendorProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [strainDraft, setStrainDraft] = useState('');

    const { threads, loading: threadsLoading, unavailable: threadsUnavailable } = useVendorThreads(vendorId);

    const loadVendor = async () => {
        const [allVendors, vendorProducts] = await Promise.all([
            apiService.getVendors(),
            apiService.getVendorProducts(vendorId),
        ]);
        const v = (allVendors as Vendor[]).find(x => x.id === vendorId) || null;
        setVendor(v);
        setProducts(vendorProducts as VendorProduct[]);
        setLoading(false);
    };

    useEffect(() => {
        setLoading(true);
        loadVendor();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vendorId]);

    const strains = useMemo(() => vendor?.strainsGrown ?? [], [vendor]);

    const handleAddStrain = async () => {
        const name = strainDraft.trim();
        if (!name || !vendor) return;
        if (strains.some(s => s.toLowerCase() === name.toLowerCase())) {
            setStrainDraft('');
            return;
        }
        const next = [...strains, name];
        try {
            await apiService.updateVendor(vendor.id, { strainsGrown: next });
            setVendor({ ...vendor, strainsGrown: next });
            setStrainDraft('');
        } catch (e) {
            console.error('Failed to add strain', e);
        }
    };

    const handleRemoveStrain = async (name: string) => {
        if (!vendor) return;
        const next = strains.filter(s => s !== name);
        try {
            await apiService.updateVendor(vendor.id, { strainsGrown: next });
            setVendor({ ...vendor, strainsGrown: next });
        } catch (e) {
            console.error('Failed to remove strain', e);
        }
    };

    const handleCompose = () => {
        if (!vendor) return;
        window.dispatchEvent(
            new CustomEvent('ai:prefill', {
                detail: { text: `compose email to ${vendor.name}` },
            }),
        );
    };

    if (loading) {
        return (
            <div className="dashboard">
                <div style={{ padding: '24px 0', color: '#737373', fontSize: '0.875rem' }}>Loading supplier...</div>
            </div>
        );
    }

    if (!vendor) {
        return (
            <div className="dashboard">
                <button
                    onClick={onBack}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#737373', display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, marginBottom: 16 }}
                >
                    <ArrowLeft size={14} /> Back
                </button>
                <div style={{ color: '#737373' }}>Vendor not found.</div>
            </div>
        );
    }

    const vendorType = vendor.vendorType || null;
    const lastContacted = vendor.lastContactedAt ?? (threads[0]?.lastActivityAt ?? null);

    return (
        <div className="dashboard">
            {/* Header row */}
            <div style={{ padding: '16px 0 12px', borderBottom: '1px solid #F1F1F1', marginBottom: 24 }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#737373', display: 'inline-flex', alignItems: 'center',
                        gap: 6, padding: 0, marginBottom: 8, fontSize: '0.8125rem',
                    }}
                >
                    <ArrowLeft size={14} /> Back to vendors
                </button>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                        <h1
                            style={{
                                fontFamily: 'Lato, sans-serif',
                                fontWeight: 900,
                                color: '#1A1A1A',
                                margin: 0,
                                fontSize: '1.875rem',
                                lineHeight: 1.15,
                                overflowWrap: 'anywhere',
                            }}
                        >
                            {vendor.name}
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                            {vendorType && (
                                <span
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        padding: '2px 8px',
                                        borderRadius: 6,
                                        fontSize: '0.6875rem',
                                        fontWeight: 700,
                                        background: vendorType === 'biomass' ? '#E8F4EC' : '#F1F1F1',
                                        color: vendorType === 'biomass' ? '#2F7E4F' : '#1A1A1A',
                                        textTransform: 'capitalize',
                                    }}
                                >
                                    {vendorType}
                                </span>
                            )}
                            {vendor.contactEmail && (
                                <span style={{ fontSize: '0.8125rem', color: '#737373' }}>{vendor.contactEmail}</span>
                            )}
                            {vendor.contactPhone && (
                                <span style={{ fontSize: '0.8125rem', color: '#737373' }}>{vendor.contactPhone}</span>
                            )}
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.6875rem', color: '#959595', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Last contacted
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#1A1A1A', fontWeight: 700, marginTop: 2 }}>
                            {formatRelative(lastContacted)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Strains section */}
            <section style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h2 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5, color: '#737373', margin: 0, fontWeight: 700 }}>
                        Strains
                    </h2>
                </div>
                {strains.length === 0 ? (
                    <div style={{ fontSize: '0.8125rem', color: '#737373', marginBottom: 10 }}>
                        No strains recorded — add from the vendor form or below.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {strains.map(s => (
                            <span
                                key={s}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '4px 8px 4px 10px',
                                    background: '#F1F1F1',
                                    color: '#1A1A1A',
                                    borderRadius: 6,
                                    fontSize: '0.8125rem',
                                    fontWeight: 600,
                                }}
                            >
                                {s}
                                <button
                                    onClick={() => handleRemoveStrain(s)}
                                    title={`Remove ${s}`}
                                    style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        padding: 2, display: 'inline-flex', alignItems: 'center',
                                        color: '#737373',
                                    }}
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                    <input
                        className="field-input"
                        value={strainDraft}
                        onChange={e => setStrainDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddStrain(); }}
                        placeholder="Add strain..."
                        style={{ maxWidth: 260, padding: '6px 10px', fontSize: '0.8125rem' }}
                    />
                    <button
                        className="btn-cancel"
                        onClick={handleAddStrain}
                        disabled={!strainDraft.trim()}
                        style={{ padding: '6px 12px' }}
                    >
                        <Plus size={13} style={{ marginRight: 4 }} /> Add
                    </button>
                </div>
            </section>

            {/* Parsed menu products */}
            <section style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h2 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5, color: '#737373', margin: 0, fontWeight: 700 }}>
                        Parsed menu products
                    </h2>
                    <span style={{ fontSize: '0.75rem', color: '#959595' }}>{products.length} total</span>
                </div>
                {products.length === 0 ? (
                    <div style={{ fontSize: '0.8125rem', color: '#737373' }}>
                        No products parsed yet. Upload a menu from the Ordering dashboard.
                    </div>
                ) : (
                    <div style={{ border: '1px solid #F1F1F1', borderRadius: 8, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                            <thead>
                                <tr style={{ background: '#FAFAFA', textAlign: 'left' }}>
                                    <th style={{ padding: '8px 12px', fontWeight: 700, color: '#737373', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Name</th>
                                    <th style={{ padding: '8px 12px', fontWeight: 700, color: '#737373', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Unit size</th>
                                    <th style={{ padding: '8px 12px', fontWeight: 700, color: '#737373', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Unit price</th>
                                    <th style={{ padding: '8px 12px', fontWeight: 700, color: '#737373', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>Last updated</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map(p => (
                                    <tr key={p.id} style={{ borderTop: '1px solid #F1F1F1' }}>
                                        <td style={{ padding: '8px 12px', color: '#1A1A1A' }}>
                                            {p.name}
                                            {p.brand && <span style={{ color: '#959595', marginLeft: 6 }}>· {p.brand}</span>}
                                        </td>
                                        <td style={{ padding: '8px 12px', color: '#737373' }}>{p.unitSize || '--'}</td>
                                        <td style={{ padding: '8px 12px', color: '#1A1A1A', textAlign: 'right' }}>{formatUnitPrice(p.unitPrice)}</td>
                                        <td style={{ padding: '8px 12px', color: '#737373' }}>{formatRelative(p.updatedAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Email threads */}
            <section style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h2 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5, color: '#737373', margin: 0, fontWeight: 700 }}>
                        Email threads
                    </h2>
                    <button className="btn-primary" onClick={handleCompose} style={{ padding: '6px 12px' }}>
                        <Send size={13} style={{ marginRight: 4 }} /> Compose
                    </button>
                </div>
                {threadsUnavailable ? (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '16px 14px',
                            border: '1px dashed #E8E8E8',
                            borderRadius: 8,
                            color: '#737373',
                            fontSize: '0.8125rem',
                        }}
                    >
                        <Mail size={15} color="#959595" />
                        Threads will appear once messaging is enabled.
                    </div>
                ) : threadsLoading ? (
                    <div style={{ fontSize: '0.8125rem', color: '#737373' }}>Loading threads...</div>
                ) : (
                    <ContactThreadTimeline threads={threads} />
                )}
            </section>
        </div>
    );
};
