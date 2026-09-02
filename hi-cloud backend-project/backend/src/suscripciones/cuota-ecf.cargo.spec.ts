import { CuotaEcfService } from './cuota-ecf.service';

/**
 * Qué se puede cobrar y qué no.
 *
 * Un cargo mal calculado que aparece solo en la cuenta de un cliente es mucho
 * más caro de deshacer que uno que no se creó, así que aquí lo que se prueba
 * sobre todo es lo que el servidor RECHAZA.
 */

const HOY = '2026-09-10';   // el ciclo 05-ago→05-sep ya está CERRADO

interface Estado {
  plan?: string | null;
  estado?: string;
  diaCorte?: number;
  emitidos?: number;
  precio?: number;
  /** cargoId ya puesto en la fila del ciclo = ese ciclo ya se cobró. */
  cargoId?: number | null;
  /** Filas que sella el UPDATE del sello. 0 = alguien se adelantó. */
  selladas?: number;
}

function montar(e: Estado = {}) {
  const consultas: { sql: string; params: any[] }[] = [];
  const ds: any = {
    query: async (sql: string, params: any[] = []) => {
      consultas.push({ sql, params });
      if (sql.includes('FROM suscripciones')) {
        return e.plan === null ? [] : [{
          plan: e.plan ?? 'plus', diaCorte: e.diaCorte ?? 5, estado: e.estado ?? 'activa',
        }];
      }
      if (sql.includes('FROM configuracion_cobros')) return [{ p: String(e.precio ?? 3) }];
      if (sql.includes('FROM ecf_consumo_ciclo'))     return [{ cargoId: e.cargoId ?? null }];
      if (sql.includes('INSERT INTO ecf_consumo_ciclo')) return [];
      if (sql.includes('UPDATE ecf_consumo_ciclo'))   return [{ n: e.selladas ?? 1 }];
      if (sql.includes('FROM ecf'))                   return [{ n: e.emitidos ?? 0 }];
      if (sql.includes('FROM empresa'))               return [];
      return [];
    },
  };
  const svc = new CuotaEcfService(ds, { notificarCuotaEcf: async () => {} } as any);
  // `estaCerrado` y el cálculo del ciclo miran "hoy": se fija para el test.
  jest.spyOn(require('../common/utils/fecha-local.util'), 'fechaHoyRD').mockReturnValue(HOY);
  return { svc, consultas };
}

afterEach(() => jest.restoreAllMocks());

describe('lo que NO se puede cobrar', () => {
  it('una empresa sin suscripción', async () => {
    const { svc } = montar({ plan: null });
    await expect(svc.datosParaCargo(44, '2026-08-05')).rejects.toThrow(/no tiene suscripción/i);
  });

  it('una suscripción en prueba — eso es una conversación de ventas', async () => {
    const { svc } = montar({ estado: 'prueba', emitidos: 9_000 });
    await expect(svc.datosParaCargo(44, '2026-08-05')).rejects.toThrow(/prueba/i);
  });

  it('una suscripción suspendida', async () => {
    const { svc } = montar({ estado: 'suspendida', emitidos: 9_000 });
    await expect(svc.datosParaCargo(44, '2026-08-05')).rejects.toThrow(/suspendida/i);
  });

  it('un ciclo TODAVÍA ABIERTO: aún puede sumar comprobantes', async () => {
    const { svc } = montar({ emitidos: 9_000 });
    await expect(svc.datosParaCargo(44, '2026-09-05')).rejects.toThrow(/sigue abierto/i);
  });

  it('un ciclo que ya se cobró', async () => {
    const { svc } = montar({ emitidos: 9_000, cargoId: 77 });
    await expect(svc.datosParaCargo(44, '2026-08-05')).rejects.toThrow(/ya se cobró.*#77/i);
  });

  it('una empresa que NO se pasó', async () => {
    const { svc } = montar({ emitidos: 5_000 });   // cupo Plus 6.000
    await expect(svc.datosParaCargo(44, '2026-08-05')).rejects.toThrow(/no se pasó/i);
  });

  it('justo el cupo tampoco es excedente: 6.000 incluidos son 6.000', async () => {
    const { svc } = montar({ emitidos: 6_000 });
    await expect(svc.datosParaCargo(44, '2026-08-05')).rejects.toThrow(/no se pasó/i);
  });

  it('CON EL PRECIO SIN CONFIGURAR, y lo dice claro', async () => {
    const { svc } = montar({ emitidos: 6_412, precio: 0 });
    await expect(svc.datosParaCargo(44, '2026-08-05'))
      .rejects.toThrow(/precio del excedente.*sin configurar/i);
  });

  it('un cicloInicio que no cuadra con el día de corte de la empresa', async () => {
    // Corte 5: un ciclo que empiece el 17 no existe para esta empresa.
    const { svc } = montar({ emitidos: 9_000, diaCorte: 5 });
    await expect(svc.datosParaCargo(44, '2026-08-17'))
      .rejects.toThrow(/no corresponde al día de corte/i);
  });
});

describe('lo que sí se cobra, y por cuánto', () => {
  it('devuelve las cifras recontadas por el servidor', async () => {
    const { svc } = montar({ emitidos: 6_412, precio: 3 });
    const d = await svc.datosParaCargo(44, '2026-08-05');
    expect(d).toMatchObject({
      emitidos: 6_412, cupo: 6_000, excedente: 412,
      precioUnitario: 3, monto: 1_236,
    });
    expect(d.ciclo).toEqual({ inicio: '2026-08-05', fin: '2026-09-05' });
  });

  it('el monto sale de excedente × precio, con dos decimales', async () => {
    const { svc } = montar({ emitidos: 6_007, precio: 2.5 });
    expect((await svc.datosParaCargo(44, '2026-08-05')).monto).toBe(17.5);
  });

  it('cada plan cobra sobre su propio cupo', async () => {
    const pyme = montar({ plan: 'pyme', emitidos: 1_030, precio: 3 });
    expect((await pyme.svc.datosParaCargo(44, '2026-08-05')).excedente).toBe(30);
    const pro = montar({ plan: 'pro', emitidos: 2_600, precio: 3 });
    expect((await pro.svc.datosParaCargo(44, '2026-08-05')).excedente).toBe(100);
  });
});

describe('el sello del ciclo', () => {
  const datos = {
    ciclo: { inicio: '2026-08-05', fin: '2026-09-05' },
    plan: 'plus' as any, planNombre: 'Plus',
    emitidos: 6_412, cupo: 6_000, excedente: 412,
    precioUnitario: 3, monto: 1_236,
  };

  it('guarda el precio y el monto CONGELADOS en la fila', async () => {
    const { svc, consultas } = montar({ selladas: 1 });
    const manager: any = { query: (ds: any, p: any) => (svc as any).ds.query(ds, p) };
    await svc.sellarCargo(manager, 44, datos, 900, 1);

    const sello = consultas.find(c => c.sql.includes('UPDATE ecf_consumo_ciclo'))!;
    // plan, cupo, emitidos, precio, monto, cargoId, admin — el recibo entero.
    expect(sello.params).toEqual([44, '2026-08-05', 'plus', 6000, 6412, 3, 1236, 900, 1]);
  });

  it('si otro cargo se adelantó, REVIENTA en vez de cobrar dos veces', async () => {
    const { svc } = montar({ selladas: 0 });
    const manager: any = { query: (sql: any, p: any) => (svc as any).ds.query(sql, p) };
    await expect(svc.sellarCargo(manager, 44, datos, 900, 1))
      .rejects.toThrow(/se cobró mientras.*No se duplica/i);
  });

  it('la reclamación del sello se lee con un SELECT, no con .length', async () => {
    // Misma trampa que ya costó 40 correos y una guarda de duplicado muerta.
    const { svc, consultas } = montar({ selladas: 1 });
    const manager: any = { query: (sql: any, p: any) => (svc as any).ds.query(sql, p) };
    await svc.sellarCargo(manager, 44, datos, 900, 1);
    const sello = consultas.find(c => c.sql.includes('UPDATE ecf_consumo_ciclo'))!;
    expect(sello.sql.trim()).toMatch(/^WITH/i);
    expect(sello.sql).toMatch(/SELECT COUNT\(\*\)/i);
  });
});
