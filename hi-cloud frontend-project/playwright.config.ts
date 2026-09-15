import { defineConfig, devices } from '@playwright/test';

/**
 * Verificación e2e contra hicloud_test (NUNCA contra producción). No hay
 * infraestructura Playwright previa en el repo — esta es la primera.
 *
 * No levanta backend/frontend por sí mismo (webServer): el backend real de
 * Nest tarda en arrancar y necesita el swap de .env a hicloud_test hecho a
 * mano (ver README de este directorio) — levantarlo aquí arriesgaría correr
 * contra el .env equivocado sin que nadie lo note. Antes de correr:
 *   1. Backend apuntando a hicloud_test, escuchando en :3000.
 *   2. `npm run dev` (Vite) en este proyecto, sirviendo en :5173.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,   // los specs comparten datos sembrados en hicloud_test
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
