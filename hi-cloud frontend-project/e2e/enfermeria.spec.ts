import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { modalOkButton, selectAntOption } from './helpers/antd';

/**
 * Verificación contra hicloud_test (empresa #1). Datos base:
 *   - ed_estudiantes id=1 Juan Pérez — tipoSangre O+, alergias "Alergia a
 *     la penicilina", condicionesMedicas "Asma leve" (sembrado a mano para
 *     este spec, ver contexto médico del registro).
 *   - admin@hicloud.com (rol admin) y docente.test@hicloud.com (rol
 *     vendedor en usuario_empresa, mismo usuario de disciplina.spec.ts) —
 *     este último representa al docente que NO debe ver este módulo.
 */

const ADMIN = { email: 'admin@hicloud.com', password: 'Admin1234' };
const DOCENTE = { email: 'docente.test@hicloud.com', password: 'Docente1234!' };

test.describe.serial('Enfermería — admin', () => {
  test('registra una visita, muestra el contexto médico y aparece en la pestaña Salud del expediente', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/educativo/enfermeria');
    await expect(page.getByRole('heading', { name: 'Enfermería' })).toBeVisible();

    // ── Registrar visita ──────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Registrar visita' }).click();
    await selectAntOption(page, 'estudianteId', 'Pérez, Juan');

    // El contexto médico del estudiante (ya en ed_estudiantes) se muestra
    // al elegirlo — quien atiende necesita verlo antes de escribir nada.
    await expect(page.getByText('Alergia a la penicilina')).toBeVisible();
    await expect(page.getByText('Asma leve')).toBeVisible();

    await page.locator('#motivo').fill('Dolor de cabeza y mareo en clase — verificacion Playwright tanda 3');
    await page.locator('#sintomas').fill('Cefalea, palidez');
    await page.locator('#atencionBrindada').fill('Reposo en enfermeria, se le tomo la presion');
    await page.locator('#medicamentoDado').fill('Acetaminofen 500mg');
    await page.locator('#atendidoPor').fill('Enf. Rosa Martínez');
    await page.getByLabel('¿Se notificó a los padres?').click();
    await modalOkButton(page).click();
    await expect(page.getByText('Visita registrada')).toBeVisible({ timeout: 10_000 });

    const fila = page.locator('tr', { hasText: 'Juan Pérez' }).first();
    await expect(fila).toBeVisible();
    await expect(fila.getByText('Acetaminofen 500mg')).toBeVisible();
    await expect(fila.getByText('Enf. Rosa Martínez')).toBeVisible();

    // ── El expediente del estudiante muestra la pestaña Salud (admin) ────
    await page.goto('/educativo/estudiantes');
    await page.locator('tr', { hasText: 'Pérez, Juan' }).first().click();
    await expect(page.getByRole('tab', { name: 'Salud' })).toBeVisible();
    await page.getByRole('tab', { name: 'Salud' }).click();
    await expect(page.getByText('Dolor de cabeza y mareo en clase').first()).toBeVisible();
  });
});

test.describe('Enfermería — control de acceso por rol', () => {
  test('un docente no ve el módulo ni la pestaña Salud del expediente', async ({ page }) => {
    await login(page, DOCENTE.email, DOCENTE.password);

    // La ruta redirige — la API real (@Roles(ADMIN)) bloquea con 403,
    // pero el docente ni llega a intentarlo desde la UI.
    await page.goto('/educativo/enfermeria');
    await expect(page).toHaveURL(/\/dashboard/);

    // La pestaña Salud no existe en el DOM del expediente para este rol.
    await page.goto('/educativo/estudiantes');
    await page.locator('tr', { hasText: 'Pérez, Juan' }).first().click();
    await expect(page.getByRole('tab', { name: 'Disciplina' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Salud' })).toHaveCount(0);

    // Y la API rechaza cualquier intento directo.
    const resp = await page.request.get('/api/v1/educativo/enfermeria');
    expect(resp.status()).toBe(403);
  });
});
