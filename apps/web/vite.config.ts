import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // El front habla siempre con su propio origen: así las cookies de sesión
      // son de primera parte y no hacen falta excepciones de CORS en el navegador.
      '/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  build: { sourcemap: true },
});
