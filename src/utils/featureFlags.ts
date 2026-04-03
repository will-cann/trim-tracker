/**
 * Feature flags — gated via VITE_FF_* environment variables.
 *
 * How it works:
 *   - Set VITE_FF_FLAGNAME=true in your .env for local dev
 *   - In Netlify, set the same var only in the deploy contexts you want
 *   - Production stays off until you flip it on in Netlify dashboard
 *
 * Usage:
 *   import { ff } from '../utils/featureFlags';
 *   if (ff.extractionWorkspace) { ... }
 */

function isEnabled(key: string): boolean {
    return import.meta.env[`VITE_FF_${key}`] === 'true';
}

export const ff = {
    /** Extraction workspace — log, SOPs, run planning, yield analytics */
    extractionWorkspace: isEnabled('EXTRACTION_WORKSPACE'),
} as const;
