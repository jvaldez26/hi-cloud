import { GastosService } from './gastos.service';
import { CategoriaGasto, CATEGORIA_LABELS } from './entities/gasto.entity';

/**
 * Exportación de gastos a Excel.
 *
 * El export salía con 10 filas —el tamaño de página— aunque el mes tuviera 32
 * gastos. La causa no estaba en el servicio sino en el DTO: el flag
 * `?exportar=true` se declaraba con
 *
 *     @IsBoolean() @Transform(({ value }) => value === 'true')
 *
 * y el ValidationPipe global corre con `enableImplicitConversion: true`, que ya
 * había convertido "true" en el booleano true. El @Transform comparaba entonces
 * `true === 'true'` → false, así que el servicio recibía false y paginaba igual.
 *
 * Se reemplazó por un endpoint dedicado sin flag ni transformaciones. Estos
 * tests fijan lo esencial: exportar no pagina, listar sí, y ambos filtran igual.
 */
describe('GastosService — exportación sin paginación', () => {
  /** QueryBuilder encadenable que registra qué se le llamó. */
  const mockQb = (filas: any[]) => {
    const llamadas: string[] = [];
    const qb: any = {};
    for (const m of ['where', 'andWhere', 'orderBy', 'skip', 'take']) {
      qb[m] = jest.fn((...args: any[]) => {
        llamadas.push(`${m}(${args[0] ?? ''})`);
        return qb;
      });
    }
    qb.getMany           = jest.fn().mockResolvedValue(filas);
    qb.getManyAndCount   = jest.fn().mockResolvedValue([filas, filas.length]);
    qb.__llamadas        = llamadas;
    return qb;
  };

  const build = (filas: any[], sucursalId: number | null = null) => {
    const qb = mockQb(filas);
    const repo: any = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      manager: { query: jest.fn().mockResolvedValue([]) },   // sin e-CF asociados
    };
    const service = new GastosService(
      repo,
      {} as any,   // asientosService — no interviene en listar/exportar
      {} as any,   // dataSource
      { getEmpresaId: () => 62, getSucursalId: () => sucursalId } as any,
      {} as any,   // emitirECFUseCase
    );
    return { service, qb };
  };

  const gastos = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, monto: 100 }));

  it('exportar devuelve TODAS las filas del período, no una página', async () => {
    const { service } = build(gastos(32));
    const r = await service.exportarTodos(8, 2026);
    expect(r).toHaveLength(32);
  });

  it('exportar no aplica skip ni take — de ahí salían las 10 filas', async () => {
    const { service, qb } = build(gastos(32));
    await service.exportarTodos(8, 2026);
    expect(qb.skip).not.toHaveBeenCalled();
    expect(qb.take).not.toHaveBeenCalled();
  });

  it('listar sí pagina — el listado normal no cambia', async () => {
    const { service, qb } = build(gastos(10));
    await service.listar({ page: 1, limit: 10 } as any, 8, 2026);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(qb.skip).toHaveBeenCalledWith(0);
  });

  it('exportar respeta el filtro de categoría', async () => {
    const { service, qb } = build(gastos(17));
    await service.exportarTodos(8, 2026, CategoriaGasto.MATERIALES);
    const cat = qb.andWhere.mock.calls.find((c: any[]) => c[0] === 'g.categoria = :cat');
    expect(cat?.[1]).toEqual({ cat: CategoriaGasto.MATERIALES });
  });

  it('exportar respeta el filtro de búsqueda', async () => {
    const { service, qb } = build(gastos(3));
    await service.exportarTodos(8, 2026, undefined, 'combustible');
    const filtros = qb.andWhere.mock.calls.map((c: any[]) => c[0]).join(' | ');
    expect(filtros).toContain('ILIKE');
  });

  it('exportar filtra por período igual que el listado', async () => {
    const { service, qb } = build(gastos(32));
    await service.exportarTodos(8, 2026);
    const periodo = qb.andWhere.mock.calls.find((c: any[]) => c[0] === 'g.periodo = :p');
    expect(periodo?.[1]).toEqual({ p: '2026-08' });
  });

  it('exportar respeta el aislamiento por sucursal', async () => {
    const { service, qb } = build(gastos(5), 7);
    await service.exportarTodos(8, 2026);
    const suc = qb.andWhere.mock.calls.find((c: any[]) => c[0] === 'g.sucursalId = :sid');
    expect(suc?.[1]).toEqual({ sid: 7 });
  });

  it('sin mes y año exporta sin filtro de período', async () => {
    const { service, qb } = build(gastos(50));
    await service.exportarTodos();
    const periodo = qb.andWhere.mock.calls.find((c: any[]) => c[0] === 'g.periodo = :p');
    expect(periodo).toBeUndefined();
  });

  it('listar y exportar aplican los MISMOS filtros — el Excel no puede traer otro conjunto', async () => {
    const filtrosDe = (qb: any) =>
      qb.andWhere.mock.calls.map((c: any[]) => c[0]).sort().join(' | ');

    const a = build(gastos(32), 7);
    await a.service.exportarTodos(8, 2026, CategoriaGasto.MATERIALES, 'papel');

    const b = build(gastos(10), 7);
    await b.service.listar(
      { page: 1, limit: 10, search: 'papel' } as any, 8, 2026, CategoriaGasto.MATERIALES,
    );

    expect(filtrosDe(a.qb)).toBe(filtrosDe(b.qb));
  });
});

/**
 * GastosService.crear() — selector de cuenta contable (2026-09-19).
 * CATEGORIA_LABELS[categoria].cuenta se calculaba y se descartaba: todo
 * gasto, sin importar su categoría, se contabilizaba contra el default
 * 6.1.2.04 del motor. Ahora se pasa como 8º parámetro de asientoGasto().
 */
describe('GastosService.crear() — pasa la cuenta de la categoría al motor de asientos', () => {
  function build() {
    const repo: any = {
      create: jest.fn((data: any) => data),
      save:   jest.fn(async (data: any) => ({ id: 99, ...data })),
    };
    const asientosService: any = { asientoGasto: jest.fn().mockResolvedValue(undefined) };
    const dataSource: any = { query: jest.fn().mockResolvedValue([{ n: 1 }]) };
    const tenantService: any = { getEmpresaId: () => 7, getSucursalId: () => undefined };
    const emitirECFUseCase: any = { execute: jest.fn().mockResolvedValue(undefined) };
    const service = new GastosService(repo, asientosService, dataSource, tenantService, emitirECFUseCase);
    return { service, asientosService };
  }

  it('gasto de Alquiler contabiliza contra 6.1.2.01, no contra el default del motor', async () => {
    const { service, asientosService } = build();
    await service.crear({
      fecha: '2026-09-19', categoria: CategoriaGasto.ALQUILER, descripcion: 'Alquiler local',
      monto: 30000, userId: 5,
    } as any);
    const cuentaPasada = asientosService.asientoGasto.mock.calls[0][7];
    expect(cuentaPasada).toBe('6.1.2.01');
  });

  it('cada categoría pasa exactamente la cuenta de CATEGORIA_LABELS — ninguna cae en el default por accidente', async () => {
    for (const categoria of Object.values(CategoriaGasto)) {
      const { service, asientosService } = build();
      await service.crear({
        fecha: '2026-09-19', categoria, descripcion: 'Gasto de prueba', monto: 100, userId: 5,
      } as any);
      const cuentaPasada = asientosService.asientoGasto.mock.calls[0][7];
      expect(cuentaPasada).toBe(CATEGORIA_LABELS[categoria].cuenta);
    }
  });

  it('sin override: usa el default de la categoría y NO marca la línea como manual', async () => {
    const { service, asientosService } = build();
    await service.crear({
      fecha: '2026-09-19', categoria: CategoriaGasto.ALQUILER, descripcion: 'Alquiler', monto: 100, userId: 5,
    } as any);
    expect(asientosService.asientoGasto.mock.calls[0][7]).toBe('6.1.2.01');
    expect(asientosService.asientoGasto.mock.calls[0][8]).toBe(false);
  });

  it('con override IGUAL al default: no cuenta como manual — el usuario pudo no tocar el campo', async () => {
    const { service, asientosService } = build();
    await service.crear({
      fecha: '2026-09-19', categoria: CategoriaGasto.ALQUILER, descripcion: 'Alquiler', monto: 100, userId: 5,
      cuentaGasto: '6.1.2.01',
    } as any);
    expect(asientosService.asientoGasto.mock.calls[0][8]).toBe(false);
  });

  it('con override DISTINTO al default: usa la cuenta elegida y marca la línea como manual', async () => {
    const { service, asientosService } = build();
    await service.crear({
      fecha: '2026-09-19', categoria: CategoriaGasto.ALQUILER, descripcion: 'Alquiler', monto: 100, userId: 5,
      cuentaGasto: '1.2.1.01', // el contador decidió que es un activo, no un gasto operativo
    } as any);
    expect(asientosService.asientoGasto.mock.calls[0][7]).toBe('1.2.1.01');
    expect(asientosService.asientoGasto.mock.calls[0][8]).toBe(true);
  });
});

/**
 * GastosService.previsualizarAsiento() — panel de vista previa (2026-09-19).
 * Delega en AsientosAutomaticosService.previsualizarGasto() — no debe
 * replicar el cálculo del asiento, solo armar los mismos insumos que crear().
 */
describe('GastosService.previsualizarAsiento()', () => {
  function build() {
    const asientosService: any = { previsualizarGasto: jest.fn().mockResolvedValue({ ok: true, lineas: [], totalDebe: 0, totalHaber: 0, cuadrado: true }) };
    const service = new GastosService({} as any, asientosService, {} as any, {} as any, {} as any);
    return { service, asientosService };
  }

  it('usa la cuenta de la categoría cuando no se pasa override', async () => {
    const { service, asientosService } = build();
    await service.previsualizarAsiento(CategoriaGasto.ALQUILER, 100, 18, 'Alquiler de septiembre');
    expect(asientosService.previsualizarGasto).toHaveBeenCalledWith(
      118, 100, 18, expect.stringContaining('Alquiler de septiembre'), '6.1.2.01',
    );
  });

  it('usa la cuenta elegida cuando SÍ se pasa override', async () => {
    const { service, asientosService } = build();
    await service.previsualizarAsiento(CategoriaGasto.ALQUILER, 100, 18, 'Alquiler', '1.2.1.01');
    expect(asientosService.previsualizarGasto).toHaveBeenCalledWith(118, 100, 18, expect.any(String), '1.2.1.01');
  });

  it('Gasto Menor (E43): el total nunca incluye ITBIS, igual que crear()', async () => {
    const { service, asientosService } = build();
    await service.previsualizarAsiento(CategoriaGasto.GASTO_MENOR, 100, 18, 'Compra menor');
    expect(asientosService.previsualizarGasto).toHaveBeenCalledWith(100, 100, 0, expect.any(String), '6.1.2.10');
  });
});
