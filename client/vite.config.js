import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server talks to the API on :5000 with cookies, so the browser only
// ever sees one origin and SameSite=Lax sessions behave like production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: false,
      },
    },
  },
});
