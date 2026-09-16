import { test, expect, Page } from '@playwright/test';
import { login } from './helpers/auth';
import { modalOkButton, modalCancelButton, selectAntOption } from './helpers/antd';

/**
 * Verificación contra hicloud_test (empresa #1). Datos base sembrados a
 * mano antes de correr:
 *   - ed_biblioteca_libros id=1 "Libro Vencido Control Playwright",
 *     cantidadTotal=1, cantidadDisponible=0.
 *   - ed_biblioteca_prestamos id=1 sobre ese libro, a María López (id=5),
 *     fechaVencimiento hace 5 días, estado='prestado' (escrito así a
 *     propósito — 'vencido' es derivado, nunca se guarda).
 */

const ADMIN = { email: 'admin@hicloud.com', password: 'Admin1234' };
const TITULO_NUEVO = 'El Quijote - Playwright tanda 2';

/** Lee el id de un libro por título consultando la API con la sesión ya autenticada de la página. */
async function libroIdPorTitulo(page: Page, titulo: string): Promise<number> {
  const resp = await page.request.get(`/api/v1/educativo/biblioteca/libros?q=${encodeURIComponent(titulo)}`);
  const body = await resp.json();
  const libro = (body.data ?? body).find((l: any) => l.titulo === titulo);
  return libro.id;
}

test.describe.serial('Biblioteca', () => {
  test('el estado vencido se deriva de fechaVencimiento, nunca se guarda', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/educativo/biblioteca');
    await page.getByRole('tab', { name: 'Vencidos' }).click();

    const panel = page.locator('.ant-tabs-tabpane-active');
    await expect(panel.getByText('Libro Vencido Control Playwright')).toBeVisible({ timeout: 10_000 });
    const fila = panel.locator('tr', { hasText: 'Libro Vencido Control Playwright' });
    await expect(fila.getByText('Vencido', { exact: true })).toBeVisible();
  });

  test('crea un libro con 2 ejemplares, presta ambos y el tercer préstamo se bloquea', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/educativo/biblioteca');

    // ── Crear libro con 2 ejemplares ─────────────────────────────────────
    await page.getByRole('button', { name: 'Nuevo libro' }).click();
    await page.locator('#titulo').fill(TITULO_NUEVO);
    await page.locator('#autor').fill('Miguel de Cervantes');
    // El modal fija cantidadTotal=1 por defecto en afterOpenChange (tras la
    // animación de apertura) — esperar a que ese valor por defecto aparezca
    // antes de sobrescribirlo, o la carrera lo pisa de vuelta a 1.
    await expect(page.locator('#cantidadTotal')).toHaveValue('1');
    await page.locator('#cantidadTotal').fill('2');
    await modalOkButton(page).click();
    await expect(page.getByText('Guardado')).toBeVisible();

    // A partir de aquí, más de una pestaña puede tener montado en el DOM un
    // <tr> con TITULO_NUEVO (Catálogo lo muestra en "titulo", Préstamos en
    // "libroTitulo") — antd Tabs no desmonta panes ya visitados. Todo
    // locator de fila se escopea a la pestaña ACTIVA.
    const panel = () => page.locator('.ant-tabs-tabpane-active');

    const filaLibro = panel().locator('tr', { hasText: TITULO_NUEVO });
    await expect(filaLibro).toBeVisible();
    await expect(filaLibro.getByText('2 / 2')).toBeVisible();

    // ── Primer préstamo (a estudiante) ───────────────────────────────────
    await page.getByRole('tab', { name: 'Préstamos' }).click();
    await page.getByRole('button', { name: 'Nuevo préstamo' }).click();
    await selectAntOption(page, 'libroId', `${TITULO_NUEVO} — Miguel de Cervantes (2 disp.)`);
    await selectAntOption(page, 'estudianteId', 'Pérez, Juan');
    await modalOkButton(page).click();
    await expect(page.getByText('Préstamo registrado').first()).toBeVisible();

    // ── Segundo préstamo (a docente) — mismo libro, queda 0 disponibles ──
    await page.getByRole('button', { name: 'Nuevo préstamo' }).click();
    await selectAntOption(page, 'libroId', `${TITULO_NUEVO} — Miguel de Cervantes (1 disp.)`);
    await selectAntOption(page, 'tipoPrestamo', 'Docente');
    await selectAntOption(page, 'docenteId', 'Fernández, Carla');
    await modalOkButton(page).click();
    await expect(page.getByText('Préstamo registrado').last()).toBeVisible();

    // ── Catálogo: 0 disponibles ───────────────────────────────────────────
    await page.getByRole('tab', { name: 'Catálogo' }).click();
    await expect(panel().locator('tr', { hasText: TITULO_NUEVO }).getByText('0 / 2')).toBeVisible();

    // ── Tercer préstamo del mismo libro: la API lo rechaza (sin ejemplares) ──
    const libroId = await libroIdPorTitulo(page, TITULO_NUEVO);
    const resp = await page.request.post('/api/v1/educativo/biblioteca/prestamos', {
      data: { libroId, estudianteId: 5, fechaVencimiento: '2027-01-01' },
    });
    expect(resp.status()).toBe(400);
    const respBody = await resp.json();
    expect(JSON.stringify(respBody)).toContain('disponibles');

    // El libro tampoco aparece ya en el selector del modal (0 disponibles)
    await page.getByRole('tab', { name: 'Préstamos' }).click();
    await page.getByRole('button', { name: 'Nuevo préstamo' }).click();
    await page.locator('#libroId').click();
    await expect(
      page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last().getByText(TITULO_NUEVO, { exact: false }),
    ).toHaveCount(0);
    await modalCancelButton(page).click();

    // ── Devolver uno — vuelve a haber 1 disponible ────────────────────────
    const filaPrestamo = panel().locator('tr', { hasText: TITULO_NUEVO }).first();
    await filaPrestamo.getByRole('button', { name: 'Devolver' }).click();
    await page.locator('.ant-popconfirm-buttons button.ant-btn-primary').click();
    await expect(page.getByText('Devolución registrada')).toBeVisible();

    await page.getByRole('tab', { name: 'Catálogo' }).click();
    await expect(panel().locator('tr', { hasText: TITULO_NUEVO }).getByText('1 / 2')).toBeVisible();
  });
});
