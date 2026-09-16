import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { modalOkButton, selectAntOption } from './helpers/antd';

/** Verificación contra hicloud_test (empresa #1). */

const ADMIN = { email: 'admin@hicloud.com', password: 'Admin1234' };
const TITULO = `Reunion de padres ${Date.now()}`;
const TITULO_EDITADO = `${TITULO} EDITADO`;

test.describe.serial('Comunicados', () => {
  test('crea un comunicado individual con WhatsApp, se filtra, se edita y se imprime', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/educativo/comunicados');
    await expect(page.getByRole('heading', { name: 'Comunicados' })).toBeVisible();

    // ── Crear: destinatario individual + WhatsApp ────────────────────────
    await page.getByRole('button', { name: 'Nuevo comunicado' }).click();
    await page.locator('#titulo').fill(TITULO);
    await page.locator('#contenido').fill('Se convoca a los padres el proximo viernes a las 4pm.');
    await selectAntOption(page, 'destinatarioTipo', 'Un estudiante');
    await selectAntOption(page, 'estudianteId', 'Pérez, Juan');
    await page.getByText('Enviar por WhatsApp').click();
    await modalOkButton(page).click();
    await expect(page.getByText('Guardado')).toBeVisible();

    const fila = page.locator('tr', { hasText: TITULO }).first();
    await expect(fila).toBeVisible();
    await expect(fila.getByText('Estudiante: Juan Pérez')).toBeVisible();
    await expect(fila.getByText('WhatsApp')).toBeVisible();
    await expect(fila.getByText('Email', { exact: true })).toHaveCount(0);

    // ── Filtro por destinatario "individual" lo sigue mostrando ──────────
    await selectAntOption(page, 'filtroDestinatario', 'Un estudiante');
    await expect(page.locator('tr', { hasText: TITULO })).toBeVisible();

    // ── Filtro por "grado" lo esconde (es individual, no de grado) ───────
    await page.locator('#filtroDestinatario').click({ force: true });
    await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last().getByText('Un grado', { exact: true }).click();
    await expect(page.locator('tr', { hasText: TITULO })).toHaveCount(0);

    // Limpiar filtro
    await page.locator('.ant-select-clear').click().catch(() => {});

    // ── Editar título ──────────────────────────────────────────────────
    await page.locator('tr', { hasText: TITULO }).first().getByRole('button').last().click();
    // El modal puebla el form con el registro en afterOpenChange (tras la
    // animación) — esperar el valor original antes de sobreescribirlo, o la
    // carrera lo pisa de vuelta (mismo patrón que el cantidadTotal de biblioteca).
    await expect(page.locator('#titulo')).toHaveValue(TITULO);
    await page.locator('#titulo').fill(TITULO_EDITADO);
    await modalOkButton(page).click();
    await expect(page.getByText('Guardado').last()).toBeVisible();
    await expect(page.locator('tr', { hasText: TITULO_EDITADO })).toBeVisible();

    // ── Imprimir abre una ventana nueva con el contenido ──────────────────
    // En headless, window.print() dispara 'afterprint' casi de inmediato y
    // la ventana se autocierra (imprimirHtml) — no hay diálogo real que
    // esperar. Lo que se verifica es que el flujo abre la ventana sin
    // reventar, no el contenido tras el cierre (carrera inherente al modo
    // headless, no al código de la app).
    const filaEditada = page.locator('tr', { hasText: TITULO_EDITADO }).first();
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      filaEditada.getByRole('button').first().click(),
    ]);
    expect(popup.url()).toContain('blob:');
  });
});
