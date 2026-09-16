import { Page, expect } from '@playwright/test';

/** Botón primario del footer del Modal actualmente abierto (evita depender del texto traducido "OK"/"Aceptar"). */
export function modalOkButton(page: Page) {
  return page.locator('.ant-modal-footer button.ant-btn-primary').last();
}

/** Botón secundario ("Cancelar") del footer del Modal actualmente abierto. */
export function modalCancelButton(page: Page) {
  return page.locator('.ant-modal-footer button.ant-btn-default').last();
}

/**
 * Abre un Select de antd por su id (Form.Item lo pasa como id al control) y
 * elige la opción por texto exacto dentro del dropdown visible.
 *
 * Con reintento: en la máquina de verificación el primer click a veces no
 * llega a abrir el dropdown a tiempo (carrera de render — confirmado
 * registrando el elemento real bajo el punto de click en corridas
 * repetidas: cuando "fallaba" el dropdown simplemente nunca se abrió, no
 * que abriera el equivocado). Sin retry, un solo intento perdido cuelga el
 * test los 45s completos esperando un texto que nunca aparece — visto en
 * comunicados.spec.ts y comedor.spec.ts.
 */
export async function selectAntOption(page: Page, id: string, texto: string) {
  const trigger = page.locator(`#${id}`);
  await expect(async () => {
    await trigger.click({ force: true });
    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await expect(dropdown.getByText(texto, { exact: true })).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last().getByText(texto, { exact: true }).click();
}
