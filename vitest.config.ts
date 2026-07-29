import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Kept in a separate config from vite.config.ts so `vite build` doesn't
// pay attention to test-only globals or setup files, and so `npm test`
// runs identically whether or not the dev server is up.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Only pick up files under src/test — matches auth's convention of
    // one deliberate tests directory rather than scanning the whole tree
    // for *.test.ts files (which would pull in the auth/ dir's tests).
    include: ['src/test/**/*.test.{ts,tsx}'],
  },
})
