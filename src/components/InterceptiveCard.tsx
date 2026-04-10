import React from 'react';
import { X, Loader2, Send } from 'lucide-react';

/**
 * Shared visual frame for intercept-based ambient cards.
 *
 * Extracted from ExtractionRunCard so that new card types (packages
 * result cards, plant lookup cards, etc.) can reuse the same chrome —
 * rounded border, header with title/subtitle/dismiss, body slot, and
 * submit footer — without duplicating ~100 lines of inline styling.
 *
 * Contract:
 * - `status` drives the frame background/border. 'submitted' tints green
 *   and hides the submit footer. 'error' shows the errorMessage under
 *   the submit button. 'submitting' disables the submit button, swaps
 *   the icon to a spinner, and hides the dismiss button.
 * - `headerIcon` is a React node — each card type picks its own icons.
 * - `onDismiss` is optional; omit to render a card without a close button.
 * - `onSubmit` is optional; omit to render a read-only card (e.g. a
 *   find_packages result that has no "apply" step).
 * - `submitColor` lets each card type tint its primary button — defaults
 *   to extraction orange (#FA9E52).
 *
 * The body is a children slot, so each card type owns its own layout:
 * ExtractionRunCard puts a field checklist there; PackagesResultCard
 * will put a packages table there.
 */
export type InterceptiveCardStatus = 'filling' | 'ready' | 'submitting' | 'submitted' | 'error';

export interface InterceptiveCardProps {
    status: InterceptiveCardStatus;

    // Header
    headerIcon?: React.ReactNode;
    title: string;
    submittedTitle?: string;      // Override title when status='submitted'
    subtitle?: string | null;

    // Dismiss
    onDismiss?: () => void;

    // Body
    children?: React.ReactNode;

    // Footer
    onSubmit?: () => void;
    submitLabel?: string;         // default "Submit"
    submitDisabled?: boolean;
    submitColor?: string;         // default '#FA9E52'
    errorMessage?: string | null;
}

export const InterceptiveCard: React.FC<InterceptiveCardProps> = ({
    status,
    headerIcon,
    title,
    submittedTitle,
    subtitle,
    onDismiss,
    children,
    onSubmit,
    submitLabel = 'Submit',
    submitDisabled = false,
    submitColor = '#FA9E52',
    errorMessage,
}) => {
    const isSubmitted = status === 'submitted';
    const isSubmitting = status === 'submitting';
    const isError = status === 'error';
    const showDismiss = !!onDismiss && !isSubmitting;
    const showFooter = !!onSubmit && !isSubmitted;
    const effectiveTitle = isSubmitted && submittedTitle ? submittedTitle : title;

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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    {headerIcon}
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#2D2D2D' }}>
                        {effectiveTitle}
                    </span>
                    {subtitle && (
                        <span style={{
                            fontSize: '12px',
                            color: '#959595',
                            fontWeight: 500,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {subtitle}
                        </span>
                    )}
                </div>
                {showDismiss && (
                    <button
                        onClick={onDismiss}
                        type="button"
                        aria-label="Dismiss"
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px',
                            color: '#C0C0C0',
                            display: 'flex',
                            flexShrink: 0,
                        }}
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* Body */}
            {children !== undefined && children !== null && (
                <div style={{ padding: '8px 14px' }}>
                    {children}
                </div>
            )}

            {/* Submit / error footer */}
            {showFooter && (
                <div style={{
                    padding: '8px 14px 12px',
                    borderTop: '1px solid #F0F0F0',
                }}>
                    <button
                        onClick={onSubmit}
                        disabled={submitDisabled || isSubmitting}
                        type="button"
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
                            cursor: !submitDisabled && !isSubmitting ? 'pointer' : 'default',
                            background: !submitDisabled ? submitColor : '#F0F0F0',
                            color: !submitDisabled ? 'white' : '#C0C0C0',
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
                                {submitLabel}
                            </>
                        )}
                    </button>
                    {isError && errorMessage && (
                        <p style={{
                            fontSize: '11px',
                            color: '#DF5B59',
                            textAlign: 'center',
                            marginTop: '6px',
                            margin: '6px 0 0 0',
                        }}>
                            {errorMessage}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
