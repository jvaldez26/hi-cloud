import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * Verificación contra hicloud_test (empresa #1). El cron de mora
 * (educativo/colegiatura/mora.cron.ts) no es disparable desde HTTP — es un
 * @Cron programado — así que estos specs verifican lo que SÍ es de cara al
 * usuario: el botón/endpoint de condonar mora sobre un cargo que YA tiene
 * mora calculada. El cron en sí (recálculo diario, idempotencia, gracia,
 * abono parcial, lock pesimista contra un pago concurrente) se verificó por
 * fuera de Playwright — disparando MoraCronService.calcularMora()
 * directamente vía NestFactory.createApplicationContext(), documentado en
 * el commit.
 *
 * Datos base sembrados a mano para este spec:
 *   - ed_cargos id=206, tipo='colegiatura', estudiante Juan Pérez (id=1),
 *     "Colegiatura con mora — fixture Playwright", montoMora=30.00,
 *     diasMora=6, moraCondonada=false — simula lo que el cron ya calculó
 *     (no se puede generar por UI/API, el cron es el único que lo escribe).
 */

const ADMIN = { email: 'admin@hicloud.com', password: 'Admin1234' };

test.describe.serial('Colegiatura — condonar mora', () => {
  test('muestra la mora en la tabla y permite condonarla con motivo obligatorio', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/educativo/colegiatura');
    await expect(page.getByRole('heading', { name: 'Colegiatura y Pagos' })).toBeVisible();

    await page.getByRole('tab', { name: 'Cargos' }).click();
    // El filtro por defecto es "Pendiente" — la fixture está vencida, no
    // pendiente (el cron ya la pasó a 'vencido'), así que hay que quitarlo.
    // Solo el Select de Estado tiene valor en este punto (Mes está vacío),
    // así que es el único con ícono de limpiar (×) en el DOM.
    await page.locator('.ant-select-clear').first().click({ force: true });
    await expect(page.locator('.ant-select').filter({ hasText: 'Pendiente' })).toHaveCount(0);

    // Con el filtro abierto a "Todos" hay más de 10 cargos (paginación por
    // defecto de la tabla, sin pageSize propio) — la fixture cae en la
    // página 2. Filtrar por mes no sirve (esta fixture se sembró sin mes/
    // año, campos que solo llena generarCargos()) — se navega la paginación.
    const filaEnPagina = () => page.locator('tr', { hasText: 'fixture Playwright' }).first();
    if (await filaEnPagina().count() === 0) {
      await page.locator('.ant-pagination-item-2 a').click();
    }
    const fila = filaEnPagina();
    await expect(fila).toBeVisible({ timeout: 10_000 });
    await expect(fila.getByText('RD$30')).toBeVisible();
    await expect(fila.getByText('vencido')).toBeVisible();

    // Motivo obligatorio: sin llenarlo, el modal no se puede aceptar.
    await fila.getByRole('button', { name: 'Condonar mora' }).click();
    await expect(page.getByText('Condonar mora').last()).toBeVisible();
    await expect(page.getByText('RD$30').last()).toBeVisible(); // el modal muestra el monto a condonar
    await page.locator('.ant-modal-footer button.ant-btn-primary').last().click();
    await expect(page.getByText('El motivo es requerido')).toBeVisible();

    await page.locator('textarea').fill('Caso especial aprobado por dirección — verificación Playwright');
    await page.locator('.ant-modal-footer button.ant-btn-primary').last().click();
    await expect(page.getByText('Mora condonada')).toBeVisible({ timeout: 10_000 });

    // Tras condonar: la columna Mora muestra "Condonada" y el botón desaparece.
    await expect(fila.getByText('Condonada')).toBeVisible();
    await expect(fila.getByRole('button', { name: 'Condonar mora' })).toHaveCount(0);
  });

  test('un cargo sin mora rechaza la condonación por API', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    // El cargo #206 ya quedó condonado en el test anterior (serial) — un
    // segundo intento debe rechazarse porque montoMora ya es 0.
    const resp = await page.request.post('/api/v1/educativo/colegiatura/cargos/206/condonar-mora', {
      data: { motivo: 'segundo intento' },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(JSON.stringify(body)).toContain('no tiene mora que condonar');
  });
});
