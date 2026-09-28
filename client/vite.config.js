import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api/* → backend on :5000 so cookies stay same-origin.
// If port 5173 is busy Vite picks the next free port automatically; the
// CORS list in server/src/app.js covers 5173–5175 for this reason.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false, // allow fallback to 5174, 5175 etc. when 5173 is busy
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: false,
      },
    },
  },
});
