/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Brand palette — overrides Tailwind defaults
                emerald: {
                    50: 'rgba(59, 181, 112, 0.08)',
                    100: 'rgba(59, 181, 112, 0.15)',
                    200: 'rgba(59, 181, 112, 0.25)',
                    300: '#7ECDA0',
                    400: '#55C184',
                    500: '#3BB570',
                    600: '#2E9A5C',
                    700: '#237A48',
                    800: '#1A5C36',
                    900: '#113D24',
                },
                teal: {
                    50: 'rgba(59, 181, 112, 0.08)',
                    100: 'rgba(59, 181, 112, 0.15)',
                    200: 'rgba(59, 181, 112, 0.25)',
                    300: '#7ECDA0',
                    400: '#55C184',
                    500: '#3BB570',
                    600: '#2E9A5C',
                    700: '#237A48',
                    800: '#1A5C36',
                    900: '#113D24',
                },
                blue: {
                    50: 'rgba(28, 158, 255, 0.08)',
                    100: 'rgba(28, 158, 255, 0.15)',
                    200: 'rgba(28, 158, 255, 0.25)',
                    300: '#6DBBFF',
                    400: '#45ABFF',
                    500: '#1C9EFF',
                    600: '#0E82DB',
                    700: '#0B66AD',
                },
                amber: {
                    50: 'rgba(250, 158, 82, 0.08)',
                    100: 'rgba(250, 158, 82, 0.15)',
                    200: 'rgba(250, 158, 82, 0.25)',
                    300: '#FBBF80',
                    400: '#FAAE66',
                    500: '#FA9E52',
                    600: '#E0863A',
                    700: '#B86A28',
                },
                orange: {
                    50: 'rgba(250, 158, 82, 0.08)',
                    100: 'rgba(250, 158, 82, 0.15)',
                    200: 'rgba(250, 158, 82, 0.25)',
                    300: '#FBBF80',
                    400: '#FAAE66',
                    500: '#FA9E52',
                    600: '#E0863A',
                    700: '#B86A28',
                },
                red: {
                    50: 'rgba(223, 91, 89, 0.08)',
                    100: 'rgba(223, 91, 89, 0.15)',
                    200: 'rgba(223, 91, 89, 0.25)',
                    300: '#E8908E',
                    400: '#E37270',
                    500: '#DF5B59',
                    600: '#C44442',
                    700: '#9E3533',
                },
                gray: {
                    50: '#F8F8F8',
                    100: '#F1F1F1',  // koala
                    200: '#E0E0E0',
                    300: '#C0C0C0',  // dolphin
                    400: '#959595',  // rhino
                    500: '#737373',
                    600: '#5C5C5C',
                    700: '#404040',
                    800: '#2A2A2A',
                    900: '#1A1A1A',  // panther
                    950: '#111111',
                },
            },
            fontFamily: {
                sans: ['Lato', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
                // Alias `mono` to Lato + tabular-nums. Keeps anything that accidentally
                // reaches for mono on-brand. For actual tabular alignment, prefer
                // `font-variant-numeric: tabular-nums` via Tailwind `tabular-nums`.
                mono: ['Lato', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
            },
            // ── Type scale ─────────────────────────────────────────────────
            // Fixed rem-based scale tuned for dense operations UI.
            // Body = 0.875rem (14px) for dashboards; use `text-prose` (1rem) for
            // descriptions, empty states, and marketing copy.
            // Each entry: [fontSize, { lineHeight, letterSpacing?, fontWeight? }].
            fontSize: {
                'micro':   ['0.6875rem', { lineHeight: '1.4',  letterSpacing: '0',        fontWeight: '700' }], // 11px — chips
                'label':   ['0.75rem',   { lineHeight: '1.4',  letterSpacing: '0.02em',   fontWeight: '700' }], // 12px — table headers, axis, form labels
                'eyebrow': ['0.6875rem', { lineHeight: '1.2',  letterSpacing: '0.08em',   fontWeight: '700' }], // 11px uppercase — section eyebrows
                'body':    ['0.875rem',  { lineHeight: '1.5',  letterSpacing: '0',        fontWeight: '400' }], // 14px — table body, cards, controls
                'prose':   ['1rem',      { lineHeight: '1.6',  letterSpacing: '0',        fontWeight: '400' }], // 16px — descriptions, empty state copy
                'subhead': ['1rem',      { lineHeight: '1.3',  letterSpacing: '-0.005em', fontWeight: '700' }], // 16px — card titles
                'h2':      ['1.25rem',   { lineHeight: '1.25', letterSpacing: '-0.01em',  fontWeight: '900' }], // 20px — section headings
                'h1':      ['1.5rem',    { lineHeight: '1.2',  letterSpacing: '-0.01em',  fontWeight: '900' }], // 24px — view headings
                'display': ['1.875rem',  { lineHeight: '1.15', letterSpacing: '-0.015em', fontWeight: '900' }], // 30px — DashboardHeader
            },
        },
    },
    plugins: [],
}
