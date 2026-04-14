/**
 * ActionPreview — `compose_supplier_email` editable preview.
 *
 * Unit 7 of the Holland SME slice: the AI composes a draft email to a
 * biomass vendor and surfaces it in the action preview for the user to
 * edit before sending. This test pins the core invariants:
 *
 * - Subject renders as an editable <input>.
 * - Body renders as an editable <textarea>.
 * - Editing either field routes through `onEditAction` using the same
 *   partial-update pattern DateTimePills / ExtractionExpandedView use.
 * - The vendor name and reason are surfaced but not editable.
 *
 * Run with:
 *     npx vitest run src/components/__tests__/ActionPreview.supplierEmail.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(() => cleanup());
import { ActionPreview } from '../ActionPreview';
import type { ProposedAction } from '../../types/definitions';

const baseAction: ProposedAction = {
    type: 'compose_supplier_email',
    data: {
        vendorId: 'vendor-mike',
        vendorName: 'Mike Farms',
        subject: 'Fresh frozen availability — Blue Dream',
        bodyText: "Hi Mike, hope you're doing well. We're planning a rosin run the week of April 22 and looking for ~50 lb fresh frozen Blue Dream. Do you have availability? Thanks, Will",
        reason: 'sourcing fresh frozen for April run',
    },
};

describe('ActionPreview — compose_supplier_email', () => {
    it('renders subject as editable input and body as editable textarea', () => {
        const onEditAction = vi.fn();
        render(<ActionPreview actions={[baseAction]} onEditAction={onEditAction} />);

        const subject = screen.getByLabelText(/subject/i) as HTMLInputElement;
        const body = screen.getByLabelText(/body/i) as HTMLTextAreaElement;

        expect(subject.tagName).toBe('INPUT');
        expect(body.tagName).toBe('TEXTAREA');
        expect(subject.value).toContain('Blue Dream');
        expect(body.value).toContain('Mike');
        expect(subject.disabled).toBe(false);
        expect(body.disabled).toBe(false);
    });

    it('routes subject edits through onEditAction as a partial update', () => {
        const onEditAction = vi.fn();
        render(<ActionPreview actions={[baseAction]} onEditAction={onEditAction} />);

        const subject = document.getElementById('supplier-email-subject') as HTMLInputElement;
        fireEvent.change(subject, { target: { value: 'Quick question' } });

        expect(onEditAction).toHaveBeenCalledWith(0, { subject: 'Quick question' });
    });

    it('routes body edits through onEditAction as a partial update', () => {
        const onEditAction = vi.fn();
        render(<ActionPreview actions={[baseAction]} onEditAction={onEditAction} />);

        const body = document.getElementById('supplier-email-body') as HTMLTextAreaElement;
        fireEvent.change(body, { target: { value: 'Hey Mike — quick check' } });

        expect(onEditAction).toHaveBeenCalledWith(0, { bodyText: 'Hey Mike — quick check' });
    });

    it('surfaces vendor and reason as read-only context', () => {
        render(<ActionPreview actions={[baseAction]} onEditAction={() => { /* noop */ }} />);

        // "Mike Farms" appears both in the summary row and the chip — at
        // least one occurrence is enough to confirm the vendor is surfaced.
        expect(screen.getAllByText('Mike Farms').length).toBeGreaterThan(0);
        expect(screen.getByText(/sourcing fresh frozen/i)).toBeTruthy();
        // Vendor should not be an editable form control
        expect(screen.queryByRole('textbox', { name: /vendor/i })).toBeNull();
    });
});
