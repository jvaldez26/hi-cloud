import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
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
    // Sube source maps a Sentry en CI y los BORRA del dist (nunca llegan al EC2).
    // Solo activo si hay SENTRY_AUTH_TOKEN (build de CI); no-op en build local.
    ...(process.env.SENTRY_AUTH_TOKEN ? [sentryVitePlugin({
      org:       process.env.SENTRY_ORG,
      project:   process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release:   { name: process.env.VITE_SENTRY_RELEASE },
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      // Si el upload falla, el build falla — preferible a source maps que nadie
      // sabe que no funcionan. Los .map se borran del dist antes o después según
      // el plugin, pero nunca quedan expuestos en el EC2 (están en filesToDeleteAfterUpload).
      errorHandler: (err) => {
        console.error('[sentry-vite-plugin] ERROR al subir source maps — abortando build:', err.message);
        throw err;
      },
    })] : []),
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
    // Source maps solo cuando el plugin de Sentry está activo (hay token) para
    // subirlos y BORRARLOS. Sin token NO se generan → nunca queda un .map en dist.
    sourcemap: process.env.SENTRY_AUTH_TOKEN ? 'hidden' : false,
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
