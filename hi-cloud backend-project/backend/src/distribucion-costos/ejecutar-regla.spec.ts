/**
 * DistribucionCostosService.ejecutarRegla — migrado del SQL crudo directo a
 * asientos_contables/asiento_lineas al motor compartido (2026-09-19).
 *
 * El bypass tenía un bug real, no solo arquitectónico: el INSERT nunca
 * ponía "numero" (columna NOT NULL en asientos_contables) — cada ejecución
 * de una regla fallaba con una violación de constraint. Además bypaseaba la
 * validación de partida doble y el reporte a Sentry del motor.
 *
 * Las líneas de la regla guardan cuentaOrigenId/cuentaDestinoId (FK numérico),
 * pero el motor resuelve por código — se busca el código antes de armar el
 * asiento (una lectura contra cuentas_contables, no una escritura al libro).
 */

import { DistribucionCostosService } from './distribucion-costos.service';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';

function makeService(regla: any, cuentas: { id: number; codigo: string }[]) {
  const dataSource = {
    query: jest.fn().mockResolvedValue(cuentas),
  };
  const reglaRepo = { update: jest.fn().mockResolvedValue({}) };
  const tenantService = { getEmpresaId: () => 7 };
  const asientosService = {
    crearAsientoContabilizado: jest.fn().mockResolvedValue({ id: 999 }),
  };

  const svc: any = Object.create(DistribucionCostosService.prototype);
  svc.dataSource      = dataSource;
  svc.reglaRepo       = reglaRepo;
  svc.tenantService    = tenantService;
  svc.asientosService  = asientosService;
  svc.findReglaById    = jest.fn().mockResolvedValue(regla);
  return { svc, dataSource, asientosService, reglaRepo };
}

const REGLA = {
  id: 1, nombre: 'Renta oficina', cuentaOrigenId: 10, vecesEjecutada: 0,
  lineas: [
    { cuentaDestinoId: 20, cuentaDestinoNombre: 'Sucursal A', porcentaje: 60 },
    { cuentaDestinoId: 21, cuentaDestinoNombre: 'Sucursal B', porcentaje: 40 },
  ],
};
const CUENTAS = [
  { id: 10, codigo: '6.1.1.01' },
  { id: 20, codigo: '6.1.1.02' },
  { id: 21, codigo: '6.1.1.03' },
];

describe('DistribucionCostosService.ejecutarRegla — vía el motor compartido', () => {
  it('delega en asientosService.crearAsientoContabilizado con las cuentas resueltas por código', async () => {
    const { svc, asientosService } = makeService(REGLA, CUENTAS);

    const r = await svc.ejecutarRegla(1, 1000, '2026-09-10', 5, 'Renta septiembre');

    expect(r.asientoId).toBe(999);
    expect(r.lineasDistribuidas).toBe(2);
    expect(asientosService.crearAsientoContabilizado).toHaveBeenCalledTimes(1);
    const params = asientosService.crearAsientoContabilizado.mock.calls[0][0];
    expect(params.tipoOrigen).toBe(TipoOrigenAsiento.MANUAL);
    expect(params.referenciaId).toBe(1);
    expect(params.lineas).toHaveLength(3); // 1 crédito origen + 2 débitos destino
    expect(params.lineas[0]).toMatchObject({ codigo: '6.1.1.01', haber: 1000, debe: 0 });
    expect(params.lineas[1]).toMatchObject({ codigo: '6.1.1.02', debe: 600 });
    expect(params.lineas[2]).toMatchObject({ codigo: '6.1.1.03', debe: 400 });
  });

  it('ya no inserta directamente en asientos_contables/asiento_lineas', async () => {
    const { svc, dataSource } = makeService(REGLA, CUENTAS);

    await svc.ejecutarRegla(1, 1000, '2026-09-10', 5, 'Renta septiembre');

    const llamadasEscritura = dataSource.query.mock.calls.filter(
      ([sql]: [string]) => sql.includes('INSERT INTO asientos_contables') || sql.includes('INSERT INTO asiento_lineas'),
    );
    expect(llamadasEscritura).toHaveLength(0);
  });

  it('actualiza vecesEjecutada/ultimaEjecucion solo si el asiento se generó', async () => {
    const { svc, reglaRepo } = makeService(REGLA, CUENTAS);

    await svc.ejecutarRegla(1, 1000, '2026-09-10', 5, 'Renta septiembre');

    expect(reglaRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ vecesEjecutada: 1 }));
  });

  it('cuenta origen inexistente/de otra empresa: rechaza con un mensaje claro, sin llamar al motor', async () => {
    const { svc, asientosService } = makeService(REGLA, CUENTAS.filter(c => c.id !== 10));

    await expect(svc.ejecutarRegla(1, 1000, '2026-09-10', 5)).rejects.toThrow(/cuenta origen/i);
    expect(asientosService.crearAsientoContabilizado).not.toHaveBeenCalled();
  });

  it('si el motor no puede generar el asiento (cuenta sin permiteMovimientos, etc.), lo traduce a un error legible', async () => {
    const { svc, asientosService } = makeService(REGLA, CUENTAS);
    asientosService.crearAsientoContabilizado.mockResolvedValueOnce(null);

    await expect(svc.ejecutarRegla(1, 1000, '2026-09-10', 5)).rejects.toThrow(/no se pudo generar el asiento/i);
  });
});
