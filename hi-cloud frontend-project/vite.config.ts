/// <reference types="vitest" />
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
    // Sentry source map upload: sentryVitePlugin NO se usa aquí.
    // La subida ocurre como paso separado en deploy.yml con sentry-cli,
    // con timeout-minutes: 3 y continue-on-error: true para no bloquear deploys.
    // El plugin colgaba indefinidamente cuando fallaba la autenticación (b391c13a → 18d8c56e).
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
  // ── Tests ──────────────────────────────────────────────────────────────────
  // Vitest reutiliza esta misma config —plugins, alias, resolve—, así que no hay
  // una segunda configuración de transformación que mantener sincronizada.
  //
  // No sustituye a los `verificar:*` de scripts/: aquellos transpilan un módulo
  // con esbuild y lo ejecutan, y siguen tal cual. Esto es para lo que necesita
  // DOM o un runner de verdad.
  test: {
    environment: 'jsdom',
    globals: true,                       // describe/it/expect sin importar, como en el backend
    setupFiles: ['./src/test/setup.ts'],
    css: false,                          // antd trae mucho CSS y no se afirma nada sobre él
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Los scripts de scripts/ se ejecutan con `npm run verificar:*`, no aquí
    exclude: ['node_modules/**', 'dist/**', 'scripts/**'],
    // Sin esto, un test que deja un timer colgado bloquea el CI hasta el timeout
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      include: ['src/utils/**', 'src/components/**'],
      reporter: ['text-summary'],
    },
  },
  build: {
    // 'hidden': genera .map pero NO añade //# sourceMappingURL al JS (cliente no los descarga).
    // sentry-cli inject añade debugIds a los .map; luego los sube y los borra del dist.
    sourcemap: 'hidden',
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
