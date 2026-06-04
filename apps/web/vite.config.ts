import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // react-grid-layout / react-draggable read `process.env.*` at runtime
  // (e.g. `process.env.DRAGGABLE_DEBUG` inside the drag handler, and
  // `process.env["NODE_ENV"]` in react-grid-layout). `process` does not exist
  // in the browser, so without this the very first drag/resize throws
  // `ReferenceError: process is not defined` and the interaction silently aborts.
  define: {
    'process.env': JSON.stringify({ NODE_ENV: mode, DRAGGABLE_DEBUG: '' }),
  },
  server: {
    // Bind to all interfaces so the dev server is reachable from other
    // devices on the LAN (e.g. a phone) without passing `--host` on the CLI,
    // which `pnpm -r --parallel dev` would also forward to `tsc --watch`.
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3767',
      '/ws': {
        target: 'ws://127.0.0.1:3767',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
}))
