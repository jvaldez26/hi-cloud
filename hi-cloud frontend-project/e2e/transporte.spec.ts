import { test, expect, Page } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * Verificación contra hicloud_test (empresa #1). Año escolar activo
 * sembrado: id=1 "2026-2027", 2026-08-15 a 2027-06-15, esActual=true —
 * necesario para que asignarEstudiante genere cargos (sin año activo,
 * cargosGenerados=0 con un motivo explicado en la respuesta).
 */

const ADMIN = { email: 'admin@hicloud.com', password: 'Admin1234' };
const RUTA = `Ruta Norte Playwright ${Date.now()}`;

function modalOkButton(page: Page) {
  return page.locator('.ant-modal-footer button.ant-btn-primary').last();
}
async function selectAntOption(page: Page, id: string, texto: string) {
  await page.locator(`#${id}`).click({ force: true });
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await dropdown.getByText(texto, { exact: true }).click();
}

test.describe.serial('Transporte', () => {
  test('crea una ruta con capacidad 1, asigna un estudiante y genera sus cargos', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/educativo/transporte');

    // ── Crear ruta con capacidad 1 ────────────────────────────────────────
    await page.getByRole('button', { name: 'Nueva ruta' }).click();
    await page.locator('#nombre').fill(RUTA);
    await page.locator('#capacidad').fill('1');
    await page.locator('#costoMensual').fill('1500');
    await modalOkButton(page).click();
    await expect(page.getByText('Guardado')).toBeVisible();

    const panel = () => page.locator('.ant-tabs-tabpane-active');
    await expect(panel().locator('tr', { hasText: RUTA })).toBeVisible();

    // ── Asignar a Juan Pérez — dispara la generación de cargos ──────────
    await panel().locator('tr', { hasText: RUTA }).getByRole('button', { name: 'Asignar' }).click();
    await expect(page.getByRole('tab', { name: 'Estudiantes', selected: true })).toBeVisible();
    await selectAntOption(page, 'estudianteId', 'Pérez, Juan');
    await modalOkButton(page).click();
    await expect(page.getByText(/cargo\(s\) de transporte generado\(s\)/)).toBeVisible({ timeout: 10_000 });

    const filaAsignacion = panel().locator('tr', { hasText: 'Juan Pérez' });
    await expect(filaAsignacion).toBeVisible();
    await expect(filaAsignacion.getByText('RD$1,500.00')).toBeVisible();

    // ── Los cargos quedan en ed_cargos, mismo motor que colegiatura ──────
    const cargosResp = await page.request.get('/api/v1/educativo/colegiatura/cargos', { params: { estudianteId: 1 } });
    const cargosBody = await cargosResp.json();
    const cargosTransporte = (cargosBody.data ?? cargosBody).filter((c: any) => c.tipo === 'transporte');
    expect(cargosTransporte.length).toBeGreaterThan(0);
    for (const c of cargosTransporte) {
      expect(Number(c.montoOriginal)).toBe(1500);
      expect(Number(c.descuento)).toBe(0); // becas no aplican a transporte
      expect(c.estado).toBe('pendiente');
    }

    // ── Capacidad 1 ya ocupada: asignar a otro estudiante lo rechaza ─────
    const rutaId = await rutaIdPorNombre(page, RUTA);
    const resp = await page.request.post('/api/v1/educativo/transporte/estudiantes', {
      data: { rutaId, estudianteId: 5 },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(JSON.stringify(body)).toContain('capacidad máxima');
  });

  test('desasignar anula los cargos futuros sin pagar', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/educativo/transporte');
    await page.getByRole('tab', { name: 'Estudiantes' }).click();

    const panel = () => page.locator('.ant-tabs-tabpane-active');
    const fila = panel().locator('tr', { hasText: RUTA });
    await fila.getByRole('button', { name: 'Desasignar' }).click();
    await page.locator('.ant-popconfirm-buttons button.ant-btn-primary').click();
    await expect(page.getByText(/cargo\(s\) futuro\(s\) sin pagar anulado\(s\)/)).toBeVisible({ timeout: 10_000 });

    const cargosResp = await page.request.get('/api/v1/educativo/colegiatura/cargos', { params: { estudianteId: 1 } });
    const cargosBody = await cargosResp.json();
    const cargosTransporte = (cargosBody.data ?? cargosBody).filter((c: any) => c.tipo === 'transporte');
    expect(cargosTransporte.length).toBeGreaterThan(1);

    const hoy = new Date().toISOString().slice(0, 10);
    for (const c of cargosTransporte) {
      if (c.fechaVencimiento.slice(0, 10) < hoy) {
        // Ya vencido antes de la baja — el servicio ya se prestó, NUNCA se anula.
        expect(c.estado).not.toBe('anulado');
      } else {
        // Futuro y sin pagar — se anula al desasignar.
        expect(c.estado).toBe('anulado');
      }
    }
  });
});

async function rutaIdPorNombre(page: Page, nombre: string): Promise<number> {
  const resp = await page.request.get('/api/v1/educativo/transporte/rutas');
  const body = await resp.json();
  const ruta = (body.data ?? body).find((r: any) => r.nombre === nombre);
  return ruta.id;
}
