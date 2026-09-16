import { test, expect, Page } from '@playwright/test';
import { login } from './helpers/auth';

/** Verificación contra hicloud_test (empresa #1). Año escolar activo id=1, esActual=true. */

const ADMIN = { email: 'admin@hicloud.com', password: 'Admin1234' };

function modalOkButton(page: Page) {
  return page.locator('.ant-modal-footer button.ant-btn-primary').last();
}
async function selectAntOption(page: Page, id: string, texto: string) {
  await page.locator(`#${id}`).click({ force: true });
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await dropdown.getByText(texto, { exact: true }).click();
}

test.describe.serial('Comedor', () => {
  test('crea un plan mensual, genera cargos, bloquea un segundo plan activo y da de baja', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/educativo/comedor');
    await expect(page.getByRole('heading', { name: 'Comedor' })).toBeVisible();

    // ── Crear plan ────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Nuevo plan' }).click();
    await selectAntOption(page, 'estudianteId', 'Pérez, Juan');
    await selectAntOption(page, 'tipo', 'Mensual');
    await page.locator('#costoMensual').fill('2000');
    await page.locator('#restriccionesAlimenticias').fill('Alergia al mani');
    await modalOkButton(page).click();
    await expect(page.getByText(/cargo\(s\) de comedor generado\(s\)/)).toBeVisible({ timeout: 10_000 });

    const fila = page.locator('tr', { hasText: 'Juan Pérez' }).first();
    await expect(fila).toBeVisible();
    await expect(fila.getByText('Mensual')).toBeVisible();
    await expect(fila.getByText('RD$2,000.00')).toBeVisible();

    // ── Los cargos van por el mismo motor que colegiatura/transporte ────
    const cargosResp = await page.request.get('/api/v1/educativo/colegiatura/cargos', { params: { estudianteId: 1 } });
    const cargosBody = await cargosResp.json();
    const cargosComedor = (cargosBody.data ?? cargosBody).filter((c: any) => c.tipo === 'comedor');
    expect(cargosComedor.length).toBeGreaterThan(0);
    for (const c of cargosComedor) {
      expect(Number(c.montoOriginal)).toBe(2000);
      expect(Number(c.descuento)).toBe(0); // becas no aplican a comedor
      expect(c.estado).toBe('pendiente');
    }

    // ── Un segundo plan activo para el mismo estudiante se rechaza ───────
    const resp = await page.request.post('/api/v1/educativo/comedor/planes', {
      data: { estudianteId: 1, tipo: 'diario', costoMensual: 1000 },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(JSON.stringify(body)).toContain('ya tiene un plan de comedor activo');

    // ── Dar de baja anula los cargos futuros sin pagar ───────────────────
    await fila.getByRole('button', { name: 'Dar de baja' }).click();
    await page.locator('.ant-popconfirm-buttons button.ant-btn-primary').click();
    await expect(page.getByText(/cargo\(s\) futuro\(s\) sin pagar anulado\(s\)/)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tr', { hasText: 'Juan Pérez' }).first().getByText('Inactivo')).toBeVisible();
  });
});
