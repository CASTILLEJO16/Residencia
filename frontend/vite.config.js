import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // El backend responde en 4000. Con el proxy no hace falta CORS en desarrollo.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // ApexCharts pesa mas que el resto de la app junta. Separarlo evita
        // que un cambio en el codigo propio invalide su cache en el navegador.
        manualChunks: {
          charts: ['apexcharts', 'react-apexcharts'],
          vendor: ['react', 'react-dom', 'react-router-dom', 'axios', 'date-fns'],
        },
      },
    },
  },
});
