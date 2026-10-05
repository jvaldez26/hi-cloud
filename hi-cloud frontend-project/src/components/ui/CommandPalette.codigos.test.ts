import { describe, it, expect } from 'vitest';
import {
  construirNavItems, construirCodigosParametrizados, construirIndiceCodigos,
  buscarPorCodigo, parsearEntradaCodigo, parsearPeriodo, mesAnteriorPorDefecto,
  pareceCodigoTransaccion, resolverCodigoTransaccion, registrarCodigoUsado,
  leerHistorialCodigos, type CodigoEntry,
} from './CommandPalette';
import {
  MENU_CATEGORIES_DATA, QUICK_ACCESS_ITEMS, CODIGOS_PARAMETRIZADOS, ADDON_IDS,
} from '../../config/menuConfig';

function indiceParaRol(rol: string, modulosActivos: string[] = [...ADDON_IDS]): CodigoEntry[] {
  return construirIndiceCodigos(
    construirNavItems(rol, modulosActivos, true),
    construirCodigosParametrizados(rol, modulosActivos),
  );
}

const indiceCompleto = indiceParaRol('admin'); // todo activo, todo accesible — catálogo "existe en el sistema"

describe('Códigos de transacción — formato y unicidad (sin duplicados)', () => {
  it('ningún código se repite entre accesos rápidos, pantallas del menú y códigos parametrizados', () => {
    const todos: string[] = [];
    for (const qa of QUICK_ACCESS_ITEMS) todos.push(qa.codigo);
    for (const cat of MENU_CATEGORIES_DATA) {
      for (const item of cat.items) {
        todos.push(item.codigo);
        if (item.accionRapida) todos.push(item.accionRapida.codigo);
      }
    }
    for (const p of CODIGOS_PARAMETRIZADOS) todos.push(p.codigo);

    const vistos = new Set<string>();
    const duplicados: string[] = [];
    for (const c of todos) {
      if (vistos.has(c)) duplicados.push(c);
      vistos.add(c);
    }
    expect(duplicados, `códigos duplicados: ${duplicados.join(', ')}`).toEqual([]);
  });

  it('todos los códigos tienen el formato AA99 (2 letras + 2 dígitos)', () => {
    const todos: string[] = [];
    for (const qa of QUICK_ACCESS_ITEMS) todos.push(qa.codigo);
    for (const cat of MENU_CATEGORIES_DATA) {
      for (const item of cat.items) {
        todos.push(item.codigo);
        if (item.accionRapida) todos.push(item.accionRapida.codigo);
      }
    }
    for (const p of CODIGOS_PARAMETRIZADOS) todos.push(p.codigo);

    const malFormados = todos.filter(c => !/^[A-Z]{2}\d{2}$/.test(c));
    expect(malFormados, `mal formados: ${malFormados.join(', ')}`).toEqual([]);
  });
});

describe('parsearEntradaCodigo / pareceCodigoTransaccion', () => {
  it('reconoce un código exacto sin parámetro', () => {
    expect(parsearEntradaCodigo('VT02')).toEqual({ codigo: 'VT02', parametro: undefined });
    expect(parsearEntradaCodigo('vt02')).toEqual({ codigo: 'VT02', parametro: undefined });
    expect(parsearEntradaCodigo('  gn01  ')).toEqual({ codigo: 'GN01', parametro: undefined });
  });

  it('separa código y parámetro', () => {
    expect(parsearEntradaCodigo('VT03 FAC-1001')).toEqual({ codigo: 'VT03', parametro: 'FAC-1001' });
    expect(parsearEntradaCodigo('FS06 09/2026')).toEqual({ codigo: 'FS06', parametro: '09/2026' });
  });

  it('texto que no tiene forma de código devuelve null', () => {
    expect(parsearEntradaCodigo('facturas')).toBeNull();
    expect(parsearEntradaCodigo('clientes activos')).toBeNull();
  });

  it('pareceCodigoTransaccion exige al menos 2 letras + 1 dígito', () => {
    expect(pareceCodigoTransaccion('VT0')).toBe(true);
    expect(pareceCodigoTransaccion('VT02')).toBe(true);
    expect(pareceCodigoTransaccion('VT')).toBe(false);   // sin dígito — no entra en modo código
    expect(pareceCodigoTransaccion('facturas')).toBe(false);
  });
});

describe('buscarPorCodigo — coincidencia parcial', () => {
  it('"FS0" lista todos los FS0x con el código visible', () => {
    const resultados = buscarPorCodigo('FS0', indiceCompleto);
    expect(resultados.length).toBeGreaterThan(1);
    expect(resultados.every(r => r.codigo.startsWith('FS0'))).toBe(true);
    expect(resultados.map(r => r.codigo)).toContain('FS01');
    expect(resultados.map(r => r.codigo)).toContain('FS06');
  });

  it('código exacto devuelve un único resultado', () => {
    const resultados = buscarPorCodigo('VT02', indiceCompleto);
    expect(resultados).toHaveLength(1);
    expect(resultados[0].codigo).toBe('VT02');
    expect(resultados[0].path).toBe('/facturas');
  });
});

describe('resolverCodigoTransaccion — código exacto abre la ruta correcta', () => {
  const indice = indiceParaRol('admin');
  const apiVacia = async () => ({});

  it('un código sin parámetro navega a su ruta', async () => {
    const r = await resolverCodigoTransaccion('GN01', indice, indiceCompleto, apiVacia);
    expect(r).toEqual({ tipo: 'ruta', ruta: '/dashboard', codigo: 'GN01' });
  });

  it('AD90 (Códigos de Transacción) abre su propia pantalla', async () => {
    const r = await resolverCodigoTransaccion('AD90', indice, indiceCompleto, apiVacia);
    expect(r).toEqual({ tipo: 'ruta', ruta: '/codigos-transaccion', codigo: 'AD90' });
  });

  it('un accionRapida (VT01 Nueva Factura) navega a su propia ruta, no a la del padre', async () => {
    const r = await resolverCodigoTransaccion('VT01', indice, indiceCompleto, apiVacia);
    expect(r).toEqual({ tipo: 'ruta', ruta: '/facturas/nueva', codigo: 'VT01' });
  });

  it('texto que no es un código se reporta como no-reconocido (se deja a la búsqueda normal)', async () => {
    const r = await resolverCodigoTransaccion('facturas de septiembre', indice, indiceCompleto, apiVacia);
    expect(r).toEqual({ tipo: 'no-reconocido' });
  });
});

describe('resolverCodigoTransaccion — sin permiso', () => {
  it('un código que existe mundialmente pero no para este rol devuelve sin-acceso', async () => {
    // '/equipo' (AD05, Usuarios y Roles) es solo-admin — vendedor no lo ve.
    const indiceVendedor = indiceParaRol('vendedor');
    const r = await resolverCodigoTransaccion('AD05', indiceVendedor, indiceCompleto, async () => ({}));
    expect(r).toEqual({ tipo: 'sin-acceso', codigo: 'AD05' });
  });
});

describe('resolverCodigoTransaccion — add-on desactivado: su código no funciona', () => {
  it('CW01 (Car Wash) no resuelve cuando el add-on está inactivo, aunque el rol sea admin', async () => {
    const indiceSinCarWash = indiceParaRol('admin', []); // sin add-ons activos
    const r = await resolverCodigoTransaccion('CW01', indiceSinCarWash, indiceCompleto, async () => ({}));
    expect(r).toEqual({ tipo: 'sin-acceso', codigo: 'CW01' });
  });

  it('con el add-on activo, el mismo código sí resuelve', async () => {
    const indiceConCarWash = indiceParaRol('admin', ['car_wash']);
    const r = await resolverCodigoTransaccion('CW01', indiceConCarWash, indiceCompleto, async () => ({}));
    expect(r).toEqual({ tipo: 'ruta', ruta: '/car-wash/dashboard', codigo: 'CW01' });
  });
});

describe('resolverCodigoTransaccion — parámetro inválido o sin resultado', () => {
  const indice = indiceParaRol('admin');

  it('VT03 con un folio que no existe en la empresa muestra un mensaje claro, no navega', async () => {
    const apiSinResultados = async () => ({});
    const r = await resolverCodigoTransaccion('VT03 FAC-NOEXISTE', indice, indiceCompleto, apiSinResultados);
    expect(r.tipo).toBe('sin-resultado');
    if (r.tipo === 'sin-resultado') expect(r.mensaje).toMatch(/no se encontr/i);
  });

  it('VT03 con un folio que sí existe navega a la factura encontrada', async () => {
    const apiConResultado = async () => ({
      Facturas: [{ tipo: 'factura', id: 42, titulo: 'FAC-1001', ruta: '/facturas/42' }],
    });
    const r = await resolverCodigoTransaccion('VT03 FAC-1001', indice, indiceCompleto, apiConResultado);
    expect(r).toEqual({ tipo: 'ruta', ruta: '/facturas/42', codigo: 'VT03' });
  });

  it('FS06 con un período mal escrito cae al mes anterior en vez de fallar', async () => {
    const r = await resolverCodigoTransaccion('FS06 no-es-un-periodo', indice, indiceCompleto, async () => ({}));
    expect(r.tipo).toBe('ruta');
    if (r.tipo === 'ruta') {
      const { mes, anio } = mesAnteriorPorDefecto();
      expect(r.ruta).toBe(`/declaraciones?tab=f606&mes=${mes}&anio=${anio}`);
    }
  });

  it('FS06 sin parámetro usa el mes anterior', async () => {
    const r = await resolverCodigoTransaccion('FS06', indice, indiceCompleto, async () => ({}));
    const { mes, anio } = mesAnteriorPorDefecto();
    expect(r).toEqual({ tipo: 'ruta', ruta: `/declaraciones?tab=f606&mes=${mes}&anio=${anio}`, codigo: 'FS06' });
  });

  it('FS06 con un período válido lo usa tal cual', async () => {
    const r = await resolverCodigoTransaccion('FS06 03/2025', indice, indiceCompleto, async () => ({}));
    expect(r).toEqual({ tipo: 'ruta', ruta: '/declaraciones?tab=f606&mes=3&anio=2025', codigo: 'FS06' });
  });
});

describe('parsearPeriodo', () => {
  it('acepta MM/AAAA, MM-AAAA y "MM AAAA"', () => {
    expect(parsearPeriodo('09/2026')).toEqual({ mes: 9, anio: 2026 });
    expect(parsearPeriodo('09-2026')).toEqual({ mes: 9, anio: 2026 });
    expect(parsearPeriodo('09 2026')).toEqual({ mes: 9, anio: 2026 });
  });

  it('mes fuera de rango cae al mes anterior', () => {
    expect(parsearPeriodo('13/2026')).toEqual(mesAnteriorPorDefecto());
  });
});

describe('Historial de códigos (localStorage)', () => {
  it('registra, deduplica y limita a 8 entradas, más reciente primero', () => {
    localStorage.clear();
    for (let i = 1; i <= 10; i++) registrarCodigoUsado(`VT0${i % 9}`);
    registrarCodigoUsado('VT02'); // ya estaba — debe moverse al frente, no duplicarse
    const historial = leerHistorialCodigos();
    expect(historial[0]).toBe('VT02');
    expect(historial.length).toBeLessThanOrEqual(8);
    expect(new Set(historial).size).toBe(historial.length); // sin duplicados
  });
});
