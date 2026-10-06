import { POS_PANELES, NAV_ITEMS, MENU_EXTRAS, PANEL_TITLES } from './posPanelesConfig';

/**
 * Las claves 'pos.panel.*' deben coincidir 1:1 con el catálogo del backend
 * (ver supervisor-politicas/supervisor-catalogo.ts) — los proyectos no
 * comparten módulos TS, así que esta es la lista espejo a mantener
 * sincronizada a mano. Si agregas un panel nuevo a POS_PANELES, agrégalo
 * también al catálogo del backend (y a esta lista).
 */
const CLAVES_CATALOGO_BACKEND = new Set([
  'pos.panel.items', 'pos.panel.inventario', 'pos.panel.facturas', 'pos.panel.pre_facturas',
  'pos.panel.cotizaciones', 'pos.panel.conduce', 'pos.panel.clientes', 'pos.panel.recibos_cobro',
  'pos.panel.anticipos', 'pos.panel.notas_credito', 'pos.panel.gastos', 'pos.panel.cierre_caja',
  'pos.panel.ventas_hoy', 'pos.panel.pro_formas', 'pos.panel.compras',
]);

describe('POS_PANELES — fuente única de pestañas del POS', () => {
  it('cada pestaña de la configuración aparece en el catálogo de Modo Supervisor', () => {
    for (const p of POS_PANELES) {
      expect(CLAVES_CATALOGO_BACKEND.has(p.claveSupervisor)).toBe(true);
    }
  });

  it('el catálogo de supervisor no tiene claves huérfanas (toda clave pos.panel.* tiene su pestaña)', () => {
    const clavesUsadas = new Set(POS_PANELES.map(p => p.claveSupervisor));
    for (const clave of CLAVES_CATALOGO_BACKEND) {
      expect(clavesUsadas.has(clave)).toBe(true);
    }
  });

  it('cada clave de supervisor es única (sin duplicados entre pestañas)', () => {
    const claves = POS_PANELES.map(p => p.claveSupervisor);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('cada id de panel es único', () => {
    const ids = POS_PANELES.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('NAV_ITEMS trae exactamente los paneles de grupo "barra" más el botón Menú', () => {
    const esperados = POS_PANELES.filter(p => p.grupo === 'barra').map(p => p.id);
    const reales = NAV_ITEMS.filter(i => i.id !== 'menu').map(i => i.id);
    expect(reales).toEqual(esperados);
    expect(NAV_ITEMS[NAV_ITEMS.length - 1]).toMatchObject({ id: 'menu', label: 'Menú' });
  });

  it('MENU_EXTRAS trae los paneles de grupo "menu", con Nueva NC justo después de Notas de Crédito e Impresora BT al final', () => {
    const paneles = MENU_EXTRAS.map(e => e.panel);
    expect(paneles).toContain('nueva-nc');
    expect(paneles).toContain('impresora-bt');
    expect(paneles[paneles.indexOf('notas-credito') + 1]).toBe('nueva-nc');
    expect(paneles[paneles.length - 1]).toBe('impresora-bt');
  });

  it('PANEL_TITLES tiene una entrada por cada PanelId de POS_PANELES', () => {
    for (const p of POS_PANELES) {
      expect(PANEL_TITLES[p.id]).toEqual({ label: p.label, icon: p.icon });
    }
  });
});
