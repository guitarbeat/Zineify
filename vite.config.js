import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    assetsDir: 'assets',
    sourcemap: true,
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/pdfjs-dist')) {
            return 'pdfjs';
          }

          if (id.includes('node_modules/jspdf')) {
            return 'jspdf';
          }

          if (id.includes('node_modules/html2canvas')) {
            return 'html2canvas';
          }

          if (id.includes('node_modules/three')) {
            return 'three';
          }
        }
      }
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: true,
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {
      ignored: ['**/.local/**', '**/node_modules/**']
    }
  },
  preview: {
    allowedHosts: true
  },
  optimizeDeps: {
    include: ['pdfjs-dist', 'jspdf', 'html2canvas', '@khmyznikov/pwa-install']
  }
});
