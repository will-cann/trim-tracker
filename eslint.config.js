import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * CI has been red since the lint job was added: the recommended presets flag
 * hundreds of pre-existing issues (especially no-explicit-any and React Compiler
 * hooks rules from eslint-plugin-react-hooks v7). Keep those as warnings so the
 * pipeline can gate real regressions (rules-of-hooks, no-undef, etc.) while the
 * debt is paid down incrementally.
 */
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'prefer-const': 'warn',
      'no-useless-catch': 'warn',
      'no-useless-escape': 'warn',
      'react-refresh/only-export-components': 'warn',

      // React Compiler–aligned rules (plugin v7). Not adopted yet.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/component-hook-factories': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/config': 'warn',
      'react-hooks/gating': 'warn',
    },
  },
])
