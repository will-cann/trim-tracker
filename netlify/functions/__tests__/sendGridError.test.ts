import { describe, it, expect } from 'vitest';
import { sendGridErrorMessage } from '../utils/email';

function sgError(status: string, errors?: Array<{ message: string; field?: string | null }>) {
    return Object.assign(new Error(status), { code: 403, response: { body: errors ? { errors } : undefined } });
}

describe('sendGridErrorMessage', () => {
    it("appends SendGrid's reasons to the status text", () => {
        const err = sgError('Forbidden', [
            { message: 'The from address does not match a verified Sender Identity.', field: 'from' },
        ]);
        expect(sendGridErrorMessage(err)).toBe(
            'Forbidden: The from address does not match a verified Sender Identity. (from)',
        );
    });

    it('joins several reasons and skips a null field', () => {
        const err = sgError('Unauthorized', [
            { message: 'The provided authorization grant is invalid, expired, or revoked', field: null },
            { message: 'Maximum credits exceeded' },
        ]);
        expect(sendGridErrorMessage(err)).toBe(
            'Unauthorized: The provided authorization grant is invalid, expired, or revoked; Maximum credits exceeded',
        );
    });

    it('falls back to the plain message without a response body', () => {
        expect(sendGridErrorMessage(new Error('socket hang up'))).toBe('socket hang up');
        expect(sendGridErrorMessage('weird')).toBe('SendGrid send failed');
    });
});
