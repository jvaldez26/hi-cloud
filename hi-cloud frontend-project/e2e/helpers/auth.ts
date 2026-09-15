import { Page, expect } from '@playwright/test';

/**
 * Login contra hicloud_test. Maneja el modal de "sesión activa detectada"
 * (sesión única) — el backend local suele traer una sesión previa de otra
 * corrida de verificación, y sin esto cada test fallaría en el primer login.
 */
export async function login(page: Page, identificador: string, password: string) {
  await page.goto('/login');
  await page.fill('#identificador', identificador);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');

  const forzarBtn = page.getByText('Continuar y cerrar sesión anterior');
  const dashboard = page.locator('body');
  await Promise.race([
    forzarBtn.waitFor({ state: 'visible', timeout: 4_000 }).catch(() => {}),
    page.waitForURL(/\/(dashboard)?$/, { timeout: 4_000 }).catch(() => {}),
  ]);
  if (await forzarBtn.isVisible().catch(() => false)) {
    await forzarBtn.click();
  }

  await expect(page).toHaveURL(/\/dashboard|\/$/, { timeout: 10_000 });
}
