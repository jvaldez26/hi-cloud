import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { modalOkButton, selectAntOption } from './helpers/antd';

/**
 * Verificación contra hicloud_test (empresa #1, "HiCloud Demo", módulo
 * educativo activo). Datos base ya sembrados a mano antes de correr:
 *   - ed_secciones: id=1 "A", id=5 "B" (mismo grado, mismo año escolar).
 *   - ed_estudiantes: id=1 Juan Pérez, id=5 María López.
 *   - ed_docentes id=1 "Carla Fernández" vinculada a users.id=7
 *     (docente.test@hicloud.com / Docente1234!, rol vendedor en
 *     usuario_empresa) vía ed_docentes.usuarioId, asignada SOLO a la
 *     sección A por ed_asignaciones_docente.
 *   - Un incidente de control en ed_disciplina (id=1) en la sección B, para
 *     el estudiante María López — el usuario docente NUNCA debe verlo.
 */

const ADMIN = { email: 'admin@hicloud.com', password: 'Admin1234' };
const DOCENTE = { email: 'docente.test@hicloud.com', password: 'Docente1234!' };

const DESCRIPCION_NUEVA = 'Interrumpio la clase repetidamente - verificacion Playwright tanda 2';

test.describe('Disciplina — admin', () => {
  test('crea un incidente en sección A, lo marca notificado y aparece en el expediente del estudiante', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);

    await page.goto('/educativo/disciplina');
    await expect(page.getByRole('heading', { name: 'Disciplina' })).toBeVisible();

    // ── Crear incidente ──────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Nuevo incidente' }).click();
    await expect(page.getByText('Nuevo incidente disciplinario')).toBeVisible();

    await selectAntOption(page, 'estudianteId', 'Pérez, Juan');
    await selectAntOption(page, 'seccionId', 'A');
    await selectAntOption(page, 'tipo', 'Grave');

    await page.locator('#categoria').fill('Interrupcion de clase');
    await page.locator('#descripcion').fill(DESCRIPCION_NUEVA);
    await page.locator('#medidaTomada').fill('Llamado de atencion verbal, cita a padres');

    await modalOkButton(page).click();
    await expect(page.getByText('Guardado')).toBeVisible();

    // ── Aparece en la tabla (estudianteNombre viene del backend como
    // "nombres apellidos", ej. "Juan Pérez" — distinto del label del
    // desplegable de creación, que es "apellidos, nombres") ──────────────
    const fila = page.locator('tr', { hasText: 'Juan Pérez' }).first();
    await expect(fila).toBeVisible();
    await expect(fila.getByText('Grave')).toBeVisible();

    // ── Marcar padres notificados ────────────────────────────────────────
    await fila.locator('button').last().click(); // botón campana: último de la fila de acciones
    await page.locator('.ant-popconfirm-buttons button.ant-btn-primary').click();
    await expect(page.getByText('Padres marcados como notificados')).toBeVisible();

    // ── El expediente del estudiante muestra el incidente ───────────────
    await page.goto('/educativo/estudiantes');
    await page.locator('tr', { hasText: 'Pérez, Juan' }).first().click();
    await page.getByRole('tab', { name: 'Disciplina' }).click();
    await expect(page.getByText('Interrupcion de clase').first()).toBeVisible();
  });
});

test.describe('Disciplina — control de acceso por rol', () => {
  test('un docente ve solo los incidentes de sus propias secciones', async ({ page }) => {
    await login(page, DOCENTE.email, DOCENTE.password);

    await page.goto('/educativo/disciplina');
    await expect(page.getByRole('heading', { name: 'Disciplina' })).toBeVisible();

    // Ve el incidente que el admin acaba de crear en su sección (A)
    await expect(page.getByText('Interrupcion de clase').first()).toBeVisible({ timeout: 10_000 });

    // NO ve el incidente de control sembrado en la sección B
    await expect(page.getByText('control-rbac')).toHaveCount(0);
    await expect(page.getByText('López, María')).toHaveCount(0);
  });
});
