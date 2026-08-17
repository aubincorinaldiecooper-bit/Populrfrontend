import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `auth/` is a fully isolated Node service (its own package.json,
  // tsconfig, node_modules) — it has its own tsc pipeline for type
  // safety. Linting it from the frontend picks up its Node-style code
  // under the frontend's browser-only rules, which is nonsense.
  globalIgnores(['dist', 'auth']),
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
  },
  // shadcn-style primitives export their CVA variant builders alongside the
  // component (`export { Button, buttonVariants }`) so link-shaped elements
  // can borrow button styling without being buttons. That mixed export trips
  // react-refresh's components-only rule; losing Fast Refresh on these small
  // leaf files is the accepted cost of the pattern.
  {
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
