import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * Verificación contra hicloud_test (empresa #1). Datos sembrados a mano
 * para esta tanda (además de los ya documentados en los otros specs de
 * educativo):
 *   - ed_anios_escolares id=4 "2025-2026" (cerrado, anterior al activo).
 *   - ed_matriculas: Juan Pérez (id=1) y estudiante "P C" (id=4) activos en
 *     el año anterior — Juan también está activo en el año actual (2026-2027,
 *     retenido); "P C" no (no retenido) — para el reporte de retención.
 *   - ed_notas_periodo: María López (id=5) con notaFinal=55 (riesgo);
 *     estudiante id=4 con notaFinal=96 (cuadro de honor).
 *   - ed_asistencia: 6 ausencias de María López en septiembre 2026 (exceso
 *     de ausencias, umbral default 5).
 *   - ed_pagos: cargos de comedor y transporte ya pagados además de
 *     colegiatura (ingresos por concepto).
 */

const ADMIN = { email: 'admin@hicloud.com', password: 'Admin1234' };
const DOCENTE = { email: 'docente.test@hicloud.com', password: 'Docente1234!' };

test.describe('Reportes — admin', () => {
  test('cartera de colegiatura muestra KPIs y el detalle por estudiante', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/educativo/reportes');
    await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible();

    // Reporte por defecto: Cartera de colegiatura
    await expect(page.getByText('Cobrado este mes')).toBeVisible();
    await expect(page.getByText('Vencido').first()).toBeVisible(); // aparece en el KPI y en la columna de la tabla
    const fila = page.locator('tr', { hasText: 'Juan Pérez' }).first();
    await expect(fila).toBeVisible();
  });

  test('morosidad por grado muestra el índice calculado', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/educativo/reportes');
    await page.getByText('Morosidad por grado').click();
    const fila = page.locator('tr', { hasText: '1ro de Primaria' }).first();
    await expect(fila).toBeVisible({ timeout: 10_000 });
    await expect(fila.getByText('%')).toBeVisible();
  });

  test('estudiantes en riesgo y cuadro de honor usan el mismo promedio de ed_notas_periodo', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/educativo/reportes');

    await page.getByText('Estudiantes en riesgo').click();
    await expect(page.locator('tr', { hasText: 'María López' }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tr', { hasText: 'María López' }).getByText('55')).toBeVisible();

    await page.getByText('Cuadro de honor').click();
    // El primer lugar (mayor promedio, 96, estudiante "P C") va antes que
    // Juan Pérez (90) — .ant-table-measure-row (fila oculta que antd usa
    // para medir columnas) también vive en <tbody>, así que se excluye.
    const filasReales = page.locator('.ant-table-tbody > tr:not(.ant-table-measure-row)');
    await expect(filasReales.first()).toBeVisible({ timeout: 10_000 });
    await expect(filasReales.first()).toContainText('96');
  });

  test('exceso de ausencias e ingresos por concepto traen datos', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/educativo/reportes');

    await page.getByText('Exceso de ausencias').click();
    await expect(page.locator('tr', { hasText: 'María López' }).first()).toBeVisible({ timeout: 10_000 });

    await page.getByText('Ingresos por concepto').click();
    await expect(page.locator('tr', { hasText: 'transporte' }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tr', { hasText: 'comedor' }).first()).toBeVisible();
  });

  test('retención de estudiantes y matrícula/crecimiento usan los dos años escolares', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/educativo/reportes');

    await page.getByText('Retención de estudiantes').click();
    await expect(page.getByText('% retención')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tr', { hasText: 'P C' }).first()).toBeVisible(); // el no retenido

    await page.getByText('Matrícula y crecimiento').click();
    await expect(page.locator('tr', { hasText: '2025-2026' }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tr', { hasText: '2026-2027' }).first()).toBeVisible();
  });

  test('exportar a Excel dispara una descarga', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/educativo/reportes');
    await expect(page.locator('tr', { hasText: 'Juan Pérez' }).first()).toBeVisible({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Excel' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  });
});

test.describe('Reportes — control de acceso por rol (incidentes disciplinarios)', () => {
  // /educativo/reportes en sí ya está restringido a admin/contador a nivel
  // de ruta (menuConfig.ts → PATH_ROLES, preexistente — docente.test tiene
  // rol "vendedor" y ni siquiera llega a esta pantalla). Lo que pide la
  // tarea es que el ENDPOINT respete el mismo filtro por sección que
  // /educativo/disciplina — se verifica a nivel de API autenticada como el
  // docente, no navegando la UI de Reportes (a la que no tiene acceso).
  test('el endpoint filtra por las secciones del docente, igual que /educativo/disciplina', async ({ page }) => {
    await login(page, DOCENTE.email, DOCENTE.password);

    const resp = await page.request.get('/api/v1/educativo/reportes/incidentes-disciplinarios');
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    const filas = body.data ?? body;

    // Carla (docente.test) solo está asignada a la sección A, donde se
    // sembró el incidente "grave" — el "leve" vive en la sección B y no
    // debe contarse en absoluto, ni sumado a otro tipo.
    expect(filas.some((f: any) => f.tipo === 'grave')).toBe(true);
    expect(filas.some((f: any) => f.tipo === 'leve')).toBe(false);
  });
});
