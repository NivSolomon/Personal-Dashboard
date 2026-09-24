import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 127.0.0.1 avoids Windows resolving `localhost` to ::1 first, which shows up as
// ECONNREFUSED from Vite's proxy while the backend is bound on IPv4.
const backend = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Keep React in the pre-bundle so a lockfile/HMR refresh cannot 504 the tab
  // with "Outdated Optimize Dep" for react.js / jsx-dev-runtime.
  optimizeDeps: {
    include: [
      'react',
      'react/jsx-dev-runtime',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/html5-qrcode') || id.includes('node_modules/@zxing')) {
            return 'barcode';
          }
          if (id.includes('node_modules/@dnd-kit')) return 'dnd';
        },
      },
    },
  },
  server: {
    port: 5173,
    // Proxying keeps the app same-origin with the API, so the session cookie
    // just works in the browser without CORS credentials juggling.
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
        timeout: 90_000,
        proxyTimeout: 90_000,
      },
      '/auth': {
        target: backend,
        changeOrigin: true,
        timeout: 90_000,
        proxyTimeout: 90_000,
      },
    },
  },
});
