import { ReportesService } from './reportes.service';

/**
 * Modo ejemplo — dashboard de una empresa recién creada.
 *
 * "Cero movimientos" es SIEMPRE histórico completo (EXISTS sobre toda la
 * tabla), nunca acotado a un rango — si dependiera del rango que consulta
 * cada widget, una empresa YA establecida con un mes flojo volvería a ver
 * "datos de ejemplo", que es justo el caso que el pedido pidió evitar. Por
 * eso es un solo chequeo aquí, compartido por todos los widgets, no uno
 * por gráfica.
 */

function servicio(opts: { diasAntiguedad: number; tieneMovimientos: boolean }) {
  const consultas: string[] = [];
  const creadaHace = new Date(Date.now() - opts.diasAntiguedad * 86_400_000).toISOString();
  const svc = new ReportesService(
    {
      query: async (sql: string) => {
        consultas.push(sql);
        if (sql.includes('FROM empresa')) return [{ createdAt: creadaHace }];
        if (sql.includes('tieneMovimientos')) return [{ tieneMovimientos: opts.tieneMovimientos }];
        return [];
      },
    } as any,
    {} as any,
    { getEmpresaId: () => 42 } as any,
    {} as any,
  );
  return { svc, consultas };
}

describe('ReportesService.getModoEjemplo()', () => {
  // `servicio()` calcula "hace N días" con Date.now() en el setup, y el
  // propio servicio vuelve a llamar Date.now() más tarde (tras el await de
  // la query) para comparar contra ese mismo límite — sin el reloj
  // congelado, cualquier milisegundo de por medio empuja "justo 30 días" a
  // 30.00000x días reales, y la comparación `<= 30` falla de forma
  // intermitente (reproducido en CI: pasa en máquinas rápidas, falla bajo
  // carga). Fake timers congelan Date.now() para todo el test, así ambas
  // llamadas ven exactamente el mismo instante.
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('empresa nueva (5 días) sin ningún movimiento real: modo ejemplo activo', async () => {
    const { svc } = servicio({ diasAntiguedad: 5, tieneMovimientos: false });
    const r = await svc.getModoEjemplo();
    expect(r.activo).toBe(true);
  });

  it('empresa nueva (5 días) con UN movimiento real: deja de calificar, aunque sea nueva', async () => {
    const { svc } = servicio({ diasAntiguedad: 5, tieneMovimientos: true });
    const r = await svc.getModoEjemplo();
    expect(r.activo).toBe(false);
  });

  it('empresa vieja (200 días) sin movimientos ESTE mes (caso normal, no nueva): NO activa modo ejemplo', async () => {
    // tieneMovimientos:false simula que, si se llegara a consultar, tampoco
    // habría — pero lo importante es que ni siquiera debería consultarse:
    // la antigüedad ya la descarta antes de tocar facturas/compras/etc.
    const { svc } = servicio({ diasAntiguedad: 200, tieneMovimientos: false });
    const r = await svc.getModoEjemplo();
    expect(r.activo).toBe(false);
  });

  it('empresa vieja: ni siquiera consulta movimientos — la antigüedad corta primero', async () => {
    const { svc, consultas } = servicio({ diasAntiguedad: 200, tieneMovimientos: false });
    await svc.getModoEjemplo();
    expect(consultas.some(s => s.includes('tieneMovimientos'))).toBe(false);
  });

  it('justo en el límite (30 días, sin movimientos): todavía activo', async () => {
    const { svc } = servicio({ diasAntiguedad: 30, tieneMovimientos: false });
    const r = await svc.getModoEjemplo();
    expect(r.activo).toBe(true);
  });

  it('un día después del límite (31 días): ya no activa, ni consulta movimientos', async () => {
    const { svc, consultas } = servicio({ diasAntiguedad: 31, tieneMovimientos: false });
    const r = await svc.getModoEjemplo();
    expect(r.activo).toBe(false);
    expect(consultas.some(s => s.includes('tieneMovimientos'))).toBe(false);
  });

  it('cachea 5 minutos — una segunda llamada inmediata no repite las consultas', async () => {
    const { svc, consultas } = servicio({ diasAntiguedad: 5, tieneMovimientos: false });
    await svc.getModoEjemplo();
    const trasPrimera = consultas.length;
    await svc.getModoEjemplo();
    expect(consultas.length).toBe(trasPrimera);
  });
});
