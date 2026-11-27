import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// While developing, /api calls are forwarded to the Express server on :5000.
export default defineConfig({
  plugins: [react()],
  // ws: true also forwards the live-editing WebSocket (/api/collab)
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:5000', ws: true } } },
});