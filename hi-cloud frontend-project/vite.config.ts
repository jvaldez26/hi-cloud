import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Plugin que inyecta la fecha/hora del build en el Service Worker.
// Cada build genera un CACHE_NAME distinto → el navegador detecta el SW como
// "nuevo" y lo instala, descartando los caches viejos automáticamente.
function injectSwVersion(): import('vite').Plugin {
  return {
    name: 'inject-sw-version',
    apply: 'build',
    closeBundle() {
      const swPath = resolve(__dirname, 'dist', 'sw.js');
      try {
        const buildDate = Date.now().toString(36); // ej: "lrk4b2"
        const sw = readFileSync(swPath, 'utf-8');
        writeFileSync(swPath, sw.replaceAll('__BUILD_DATE__', buildDate));
        console.log(`[SW] Cache version: hicloud-${buildDate}`);
      } catch {
        // sw.js puede no existir si no hay PWA
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    injectSwVersion(),
    // TODO: Sentry source map upload desactivado temporalmente.
    // El plugin (@sentry/vite-plugin) se cuelga indefinidamente en el deploy de CI
    // cuando SENTRY_AUTH_TOKEN está configurado pero la subida falla (token expirado,
    // red lenta, etc.), bloqueando deploys de producción por 20-25 minutos.
    // Reactivar cuando se confirme que el token es válido y se agregue un timeout.
    // Ver: commits b391c13a → 18d8c56e → este commit.
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // WebSocket Socket.IO para tiempo real
      '/realtime': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // Source maps desactivados hasta que el upload a Sentry esté estabilizado.
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // react/react-dom se quedan en el entry bundle (son el runtime, separarlos crea ciclos)
        // Solo separamos librerías grandes e independientes
        manualChunks(id) {
          if (id.includes('node_modules/antd/') || id.includes('node_modules/@ant-design/') || id.includes('node_modules/rc-')) {
            return 'vendor-antd';
          }
          if (id.includes('node_modules/recharts/') || id.includes('node_modules/d3-')) {
            return 'vendor-charts';
          }
        },
      },
    },
  },
});
