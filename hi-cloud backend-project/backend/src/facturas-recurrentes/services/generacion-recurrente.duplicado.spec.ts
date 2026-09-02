import { GeneracionRecurrenteService } from './generacion-recurrente.service';

/**
 * Que dos corridas no saquen dos facturas del mismo ciclo.
 *
 * El escenario real: alguien pulsa "Ejecutar ahora" mientras el cron de las
 * 5:10 ya está generando esa misma plantilla —o pulsa dos veces seguidas—. Las
 * dos corridas leyeron la plantilla ANTES de que ninguna escribiera, así que
 * las dos pasan la guarda barata de arriba (`ultimaEjecucion >= hoy`) y llegan
 * a la transacción. Ahí, la única protección es el UPDATE condicional: quien
 * llega segundo toca cero filas y tiene que salir sin crear nada.
 *
 * Con un e-CF por factura, un duplicado no son dos facturas: son dos
 * comprobantes fiscales del mismo concepto declarados a la DGII.
 */

/**
 * Doble del driver que IMITA lo que devuelve TypeORM 0.3.31, no lo que a uno le
 * gustaría que devolviera. Comprobado contra PostgreSQL:
 *
 *   UPDATE / DELETE  ->  [rows, rowCount]   // array de 2, SIEMPRE
 *   el resto         ->  rows               // filas planas
 *
 * Esta distinción es el motivo de que exista este fichero: el guardia se leía
 * con `.length > 0` sobre un `[[], 0]`, que da 2, así que jamás salía.
 */
function comoTypeorm(sql: string, filas: any[]): any {
  const cmd = sql.replace(/--[^\n]*/g, ' ').trim().split(/\s+/)[0].toUpperCase();
  return cmd === 'UPDATE' || cmd === 'DELETE' ? [filas, filas.length] : filas;
}

interface Opciones {
  /** Filas que el avance consigue actualizar. 0 = otra corrida se adelantó. */
  filasAvanzadas: number;
}

function montar(opts: Opciones) {
  const facturasCreadas: any[] = [];
  const sqlEjecutado: string[] = [];

  const manager: any = {
    query: async (sql: string) => {
      sqlEjecutado.push(sql);
      // El avance: la sentencia es `WITH ... SELECT COUNT(*)`, así que el driver
      // devuelve filas planas y la fila trae el conteo. `comoTypeorm` decide la
      // forma leyendo el SQL, no confiando en lo que el test crea saber — si
      // alguien vuelve a dejar el UPDATE pelado, el doble lo refleja.
      if (/UPDATE\s+facturas_recurrentes/i.test(sql)) {
        return comoTypeorm(sql, [{ n: opts.filasAvanzadas }]);
      }
      if (/siguiente_numero_secuencia/i.test(sql))     return comoTypeorm(sql, [{ numero: 1001 }]);
      return comoTypeorm(sql, []);
    },
    create: (_e: any, x: any) => x,
    save:   async (_e: any, x: any) => {
      if (x && x.folio) facturasCreadas.push(x);
      return { id: 500, ...x };
    },
    // El mock deja que insertarFactura llegue hasta el final. Si se quedara a
    // medias, el test fallaría por un hueco del doble y no por el fallo que
    // persigue — y un rojo por el motivo equivocado no prueba nada.
    findOneOrFail: async () => ({ id: 500, folio: 'FAC-1001' }),
    getRepository: () => ({ update: async () => ({}) }),
  };

  const ds: any = {
    transaction: async (cb: any) => cb(manager),
    getRepository: () => ({ update: async () => ({}) }),
    query: async () => [],
  };

  const vendedorResolver: any = {
    resolverVendedor: async () => ({ vendedorId: 7, nombreVendedor: 'Vendedor' }),
  };

  const svc = new GeneracionRecurrenteService(ds, vendedorResolver);
  // Las líneas no son el objeto de esta prueba: una basta para que haya factura.
  (svc as any).calcularLineas = async () => ([{
    descripcion: 'Iguala mensual', precioUnitario: 1000, cantidad: 1,
    porcentajeIva: 18, subtotal: 1000, importeIva: 180, total: 1180,
  }]);

  return { svc, facturasCreadas, sqlEjecutado };
}

/** Plantilla tal y como la leyó quien pulsó el botón: todavía sin generar hoy. */
const plantilla = (): any => ({
  id: 2, empresaId: 57, nombre: 'Iguala de servicios profesionales',
  clienteId: 10, userId: 3, activa: true,
  frecuencia: 'mensual', diaMes: 1,
  fechaInicio: '2026-08-01',
  proximaEjecucion: '2026-09-01',
  ultimaEjecucion: '2026-08-01',   // la de AYER: el cron de hoy aún no había escrito
  fechaFin: null, formaPago: 'CONTADO', diasCredito: 0,
  detalles: [{}], totalGeneradas: 1, ciclosSaltados: 0,
});

const HOY = '2026-09-01';

describe('"Ejecutar ahora" contra el cron del mismo día', () => {
  it('NO crea una segunda factura si el avance no le tocó ninguna fila', async () => {
    // El cron ganó la carrera: cuando llega el UPDATE de esta corrida, la
    // condición `ultimaEjecucion < hoy` ya no se cumple y afecta 0 filas.
    const { svc, facturasCreadas } = montar({ filasAvanzadas: 0 });

    const r = await svc.ejecutarCiclo(plantilla(), HOY, true);

    expect(facturasCreadas).toHaveLength(0);
    expect(r.estado).toBe('omitida');
    if (r.estado === 'omitida') expect(r.motivo).toMatch(/paralelo|no se duplica/i);
  });

  it('sí la crea cuando el avance sí le tocó su fila', async () => {
    // La otra cara: si esta corrida es la que gana, tiene que generar.
    const { svc, facturasCreadas } = montar({ filasAvanzadas: 1 });

    const r = await svc.ejecutarCiclo(plantilla(), HOY, true);

    expect(facturasCreadas).toHaveLength(1);
    expect(r.estado).toBe('generada');
  });

  it('el avance va ANTES del INSERT: no se gasta un folio para deshacerlo', async () => {
    const { svc, sqlEjecutado } = montar({ filasAvanzadas: 0 });
    await svc.ejecutarCiclo(plantilla(), HOY, true);

    const iAvance   = sqlEjecutado.findIndex(s => /UPDATE\s+facturas_recurrentes/i.test(s));
    const iSecuencia = sqlEjecutado.findIndex(s => /siguiente_numero_secuencia/i.test(s));
    expect(iAvance).toBeGreaterThanOrEqual(0);
    // Si se pidió folio, el avance tuvo que ir primero. Lo normal es que ni se pida.
    if (iSecuencia >= 0) expect(iAvance).toBeLessThan(iSecuencia);
  });

  it('la guarda barata sigue cubriendo el caso sin carrera', async () => {
    // Botón pulsado DESPUÉS de que el cron terminara: la plantilla ya viene con
    // la fecha de hoy y ni siquiera se llega a la transacción.
    const { svc, facturasCreadas } = montar({ filasAvanzadas: 1 });
    const rec = { ...plantilla(), ultimaEjecucion: HOY };

    const r = await svc.ejecutarCiclo(rec, HOY, true);

    expect(facturasCreadas).toHaveLength(0);
    expect(r.estado).toBe('omitida');
    if (r.estado === 'omitida') expect(r.motivo).toMatch(/Ya se generó/i);
  });
});

describe('la forma que devuelve el driver', () => {
  it('un UPDATE que no toca nada devuelve [[], 0], cuya longitud es 2', () => {
    // El test que le faltaba al bug: `[[], 0].length` es 2, así que cualquier
    // guarda escrita como `.length > 0` da SIEMPRE true.
    const vacio = comoTypeorm('UPDATE t SET a=1 WHERE false RETURNING id', []);
    expect(vacio).toEqual([[], 0]);
    expect(vacio.length).toBe(2);
    expect(vacio.length > 0).toBe(true);
  });

  it('un SELECT sí devuelve las filas planas', () => {
    expect(comoTypeorm('SELECT 1 AS n', [{ n: 1 }])).toEqual([{ n: 1 }]);
  });
});
