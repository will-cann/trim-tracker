# shared/

Types and constants shared between the website (`src/`), Netlify functions, and the growth server (`growth/`). Both sides import these files with relative paths, so they compile into each bundle. There's no package to publish.

Rules, so every consumer can import them:
- No runtime dependencies and no imports from outside `shared/`.
- No Node or DOM APIs. Plain TypeScript only: types, `as const` data, pure functions.
- Use `import type` for type-only imports (the app compiles with `verbatimModuleSyntax`).

| File | Used by |
|------|---------|
| `growth/demoRequest.ts` | `src/lib/demoRequest.ts`, `src/components/public/DemoRequestPage.tsx`, `growth/src/demoRequest.ts` |
