import { describe, it, expect } from 'vitest';
import { construirNavItems } from './CommandPalette';
import {
  MENU_CATEGORIES_DATA, ADDON_IDS, QUICK_ACCESS_ITEMS, rolPuedeVerRuta,
} from '../../config/menuConfig';

/**
 * Paridad buscador global ↔ sidebar: ambos se construyen desde la MISMA
 * fuente (menuConfig.ts) con las MISMAS reglas (rol + add-ons activos), así
 * que basta con probar construirNavItems() directamente contra esa fuente —
 * es la fuente la que define lo que el sidebar también renderiza.
 */

const ROLES = ['admin', 'contador', 'vendedor', 'viewer', 'super_admin'];

describe('CommandPalette — paridad con el sidebar (misma fuente, mismas reglas)', () => {
  it.each(ROLES)('cada ítem visible del menú para el rol "%s" aparece en el buscador', (rol) => {
    const modulosActivos = [...ADDON_IDS]; // todos los add-on activos — caso "ve todo lo que el rol permite"
    const items = construirNavItems(rol, modulosActivos, true);
    const keys = new Set(items.map(i => i.key));

    for (const cat of MENU_CATEGORIES_DATA) {
      for (const item of cat.items) {
        if (!rolPuedeVerRuta(item.path, rol)) continue;
        expect(keys, `${item.path} (categoría ${cat.id}, rol ${rol})`).toContain(item.path);
      }
    }

    for (const qa of QUICK_ACCESS_ITEMS) {
      if (!rolPuedeVerRuta(qa.path, rol)) continue;
      expect(keys, `${qa.path} (acceso rápido, rol ${rol})`).toContain(qa.path);
    }
  });

  it('un add-on desactivado no aparece en el buscador (ninguna de sus pantallas)', () => {
    // Ningún módulo add-on activo — vendedor es rol permisivo para no confundir
    // "oculto por rol" con "oculto por add-on".
    const items = construirNavItems('admin', [], true);
    const keys = new Set(items.map(i => i.key));

    const categoriasAddon = MENU_CATEGORIES_DATA.filter(c => ADDON_IDS.includes(c.id));
    expect(categoriasAddon.length).toBeGreaterThan(0); // sanity — hay módulos add-on que probar

    for (const cat of categoriasAddon) {
      for (const item of cat.items) {
        expect(keys, `${item.path} NO debería aparecer (add-on ${cat.id} desactivado)`).not.toContain(item.path);
      }
    }
  });

  it('un add-on SÍ activado aparece en el buscador', () => {
    const items = construirNavItems('admin', ['car_wash'], true);
    const keys = new Set(items.map(i => i.key));
    expect(keys.has('/car-wash/dashboard')).toBe(true);
    expect(keys.has('/car-wash/servicios')).toBe(true);

    // Otro add-on NO activado sigue ausente aunque car_wash sí lo esté.
    expect(keys.has('/clinica')).toBe(false);
  });

  it('un rol sin permiso para una ruta no la ve, aunque el add-on esté activo', () => {
    // '/car-wash/servicios' y '/car-wash/lavadores' son solo-admin (ver PATH_ROLES).
    const items = construirNavItems('vendedor', ['car_wash'], true);
    const keys = new Set(items.map(i => i.key));
    expect(keys.has('/car-wash/dashboard')).toBe(true);   // ADMIN_CONT_VEND — vendedor sí ve esto
    expect(keys.has('/car-wash/servicios')).toBe(false);  // ADMIN — vendedor no
  });

  it('HiCloud Xlink respeta su propio gate de plan, no solo el de rol', () => {
    const conXlink = construirNavItems('admin', [], true);
    const sinXlink = construirNavItems('admin', [], false);
    expect(conXlink.some(i => i.key === '/xlink')).toBe(true);
    expect(sinXlink.some(i => i.key === '/xlink')).toBe(false);
  });

  it('cada ítem con accionRapida expone su acción bajo el grupo "Acciones"', () => {
    const items = construirNavItems('admin', [], true);
    const nuevaFactura = items.find(i => i.key === '/facturas/nueva');
    expect(nuevaFactura).toBeDefined();
    expect(nuevaFactura?.group).toBe('Acciones');
    expect(nuevaFactura?.label).toBe('Nueva Factura');
  });
});
