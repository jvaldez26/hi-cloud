import { ForbiddenException, BadRequestException, NotFoundException, HttpException } from '@nestjs/common';
import { CajaService } from './caja.service';
import { CierreCaja, EstadoCierre } from './entities/cierre-caja.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

const EMPRESA = 7;

function buildDeps() {
  return {
    repo: {
      findOne: jest.fn(),
      find:    jest.fn(),
      update:  jest.fn().mockResolvedValue(undefined),
      create:  jest.fn((d: any) => d),
      save:    jest.fn((e: any) => Promise.resolve({ id: 1, ...e })),
      createQueryBuilder: jest.fn(),
    },
    retiroRepo: { find: jest.fn(), findOne: jest.fn() },
    dataSource: {
      // resolverMiVendedorId() y getEmpresaCfg()/recalcularDesdeBD() fuera de
      // transacción usan rutas distintas (query directo vs manager.query) —
      // ambas se mockean con una fila vacía por defecto, suficiente para que
      // Number(row?.campo ?? 0) resuelva a 0 sin reventar.
      query:   jest.fn().mockResolvedValue([]),
      manager: {
        query:  jest.fn().mockResolvedValue([{}]),
        update: jest.fn().mockResolvedValue(undefined),
        // conCuadreCorregido() busca ajustes vía getRepository(AjusteCierreCaja)
        // — sin ajustes por defecto, ningún test de esta suite los necesita.
        getRepository: jest.fn(() => ({ find: jest.fn().mockResolvedValue([]) })),
      },
    },
    // getRolEmpresa: el rol de la empresa ACTIVA (usuario_empresa), nunca
    // `usuario.role` — ver el comentario en cerrarCaja/getFacturasDetalle.
    // Default ADMIN porque la mayoría de los casos de abajo son admin;
    // los que de verdad dependen del rol lo sobrescriben explícitamente.
    tenantSvc:   { getEmpresaId: () => EMPRESA, getSucursalId: () => undefined, getRolEmpresa: () => UserRole.ADMIN as string | null },
    realtimeSvc: { notify: jest.fn() },
    notificacionesSvc: { notificarDescuadreCierre: jest.fn().mockResolvedValue(undefined) },
    // Default: add-on 'prestamista' activo — preserva el comportamiento de
    // TODA esta suite (escrita antes de que existiera el gate por add-on).
    // Los tests de aislamiento (ver "efectivo de préstamos por caja (Etapa 5)"
    // más abajo) lo sobrescriben a `false` explícitamente.
    modulosAddonSvc: { checkModuloActivo: jest.fn().mockResolvedValue(true) },
  };
}

function buildService(d: ReturnType<typeof buildDeps>): CajaService {
  return new CajaService(
    d.repo as any, d.retiroRepo as any, d.dataSource as any, d.tenantSvc as any,
    d.realtimeSvc as any, d.notificacionesSvc as any, d.modulosAddonSvc as any,
  );
}

function cajaAbierta(overrides: Partial<CierreCaja> = {}): CierreCaja {
  return {
    id: 1, fecha: new Date('2026-10-03'), vendedorId: 5, vendedorNombre: 'Maximo',
    sucursalId: undefined, estado: EstadoCierre.ABIERTA,
    saldoApertura: 0, ventasEfectivo: 0, ventasTarjeta: 0, ventasTransferencia: 0, ventasCredito: 0,
    cobrosRecibidos: 0, cobrosEfectivo: 0, cobrosOtrosMedios: 0,
    totalAnticipos: 0, anticiposEfectivo: 0, anticiposOtrosMedios: 0,
    gastosEfectivo: 0, retiros: 0, saldoCierre: 0, saldoFisico: 0, diferencia: 0,
    formulaVersion: 2, cantidadTransacciones: 0, userId: 100, empresaId: EMPRESA,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  } as CierreCaja;
}

// Caso real (2026-10-04): cerrarCaja() nunca verificaba que la caja
// perteneciera a quien la cerraba — cualquier VENDEDOR podía cerrar la de
// otro cajero con solo mandar su id en la URL.
describe('CajaService.cerrarCaja — pertenencia', () => {
  it('VENDEDOR no puede cerrar la caja de OTRO cajero (ni userId ni perfil de vendedor coinciden)', async () => {
    const d = buildDeps();
    d.tenantSvc.getRolEmpresa = () => UserRole.VENDEDOR;
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 100, vendedorId: 5 }));
    d.dataSource.query.mockResolvedValue([]); // sin perfil de vendedor para el usuario 999
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 999 }),
    ).rejects.toThrow(ForbiddenException);

    expect(d.repo.update).not.toHaveBeenCalled(); // nunca llega a tocar la caja
  });

  it('VENDEDOR SÍ puede cerrar su propia caja (coincide por userId — él mismo la abrió)', async () => {
    const d = buildDeps();
    d.tenantSvc.getRolEmpresa = () => UserRole.VENDEDOR;
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 42, vendedorId: 5 }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 42 }),
    ).resolves.toBeDefined();

    expect(d.repo.update).toHaveBeenCalled();
  });

  it('VENDEDOR SÍ puede cerrar la caja que le abrió un encargado (coincide por su perfil de vendedor, no por userId)', async () => {
    const d = buildDeps();
    d.tenantSvc.getRolEmpresa = () => UserRole.VENDEDOR;
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 999, vendedorId: 5 })); // la abrió el encargado #999
    d.dataSource.query.mockResolvedValue([{ id: 5 }]); // el perfil de vendedor del usuario #42 es el 5
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 42 }),
    ).resolves.toBeDefined();

    expect(d.repo.update).toHaveBeenCalled();
  });

  it('ADMIN/CONTADOR pueden cerrar la caja de cualquier cajero — pero sin motivo, 400', async () => {
    const d = buildDeps(); // default: getRolEmpresa → ADMIN
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 999, vendedorId: 5 }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1 }),
    ).rejects.toThrow(BadRequestException);

    expect(d.repo.update).not.toHaveBeenCalled();
  });

  it('ADMIN/CONTADOR con motivo: sí puede cerrar la caja de otro cajero, y el motivo queda en notas', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 999, vendedorId: 5, vendedorNombre: 'Maximo Almonte', notas: undefined }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1, nombre: 'Jean Admin' }, 'Cajero se fue sin cerrar'),
    ).resolves.toBeDefined();

    expect(d.repo.update).toHaveBeenCalled();
    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.notas).toContain('Jean Admin');
    expect(cambios.notas).toContain('Maximo Almonte');
    expect(cambios.notas).toContain('Cajero se fue sin cerrar');
  });

  it('con motivo en blanco (solo espacios): sigue rechazando, no cuenta como motivo real', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 999, vendedorId: 5 }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1 }, '   '),
    ).rejects.toThrow(BadRequestException);
  });

  it('ADMIN cerrando SU PROPIA caja: no exige motivo', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, vendedorId: 5 }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1 }),
    ).resolves.toBeDefined();

    expect(d.repo.update).toHaveBeenCalled();
  });

  it('sin `usuario` (compatibilidad): no aplica el chequeo de pertenencia', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 999, vendedorId: 5 }));
    const service = buildService(d);

    await expect(service.cerrarCaja(1, 500)).resolves.toBeDefined();
  });

  it('caja ya cerrada: BadRequestException, sin importar quién la cierre', async () => {
    const d = buildDeps();
    d.tenantSvc.getRolEmpresa = () => UserRole.VENDEDOR;
    d.repo.findOne.mockResolvedValue(cajaAbierta({ estado: EstadoCierre.CERRADA }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1 }),
    ).rejects.toThrow(BadRequestException);
  });
});

// Caso real (empresa 73, cajera Bellamar González, 2026-10-09): FAC-1803 se
// registró como Tarjeta 955 + Efectivo 125 cuando fue al revés (Efectivo 955
// + Tarjeta 125). El cierre solo cuadraba efectivo: "+829.94 SOBRANTE" — era
// la tarjeta la que faltaba, no dinero de más. Ver cuadre-por-forma-pago.util.ts.
describe('CajaService.cerrarCaja — cuadre por forma de pago (caso real empresa 73)', () => {
  function mockQueryPorSql(d: ReturnType<typeof buildDeps>) {
    d.dataSource.manager.query.mockImplementation((sql: string) => {
      if (sql.includes('recibos_cobro') && sql.includes('tarjeta'))
        return Promise.resolve([{ tarjeta: '0', transferencia: '0' }]);
      if (sql.includes('anticipo_cliente') && sql.includes('tarjeta'))
        return Promise.resolve([{ tarjeta: '0', transferencia: '0' }]);
      if (sql.includes('recibos_cobro') || sql.includes('anticipo_cliente'))
        return Promise.resolve([{ total: '0' }]);
      if (sql.includes('FROM facturas f'))
        return Promise.resolve([]); // sin facturas sin forma de pago ni candidatas, en este caso
      return Promise.resolve([{}]);
    });
  }

  it('efectivo +829.94 / tarjeta -830.00 → detecta "posible forma mal registrada", no un sobrante real', async () => {
    const d = buildDeps();
    mockQueryPorSql(d);
    d.repo.findOne.mockResolvedValue(cajaAbierta({
      id: 1, userId: 1, vendedorId: 12, vendedorNombre: 'Bellamar González',
      saldoApertura: 0, ventasEfectivo: 5608.06, ventasTarjeta: 2605.00,
    }));
    const service = buildService(d);

    const declaradoPorForma = [
      { forma: 'efectivo', monto: 6438.00 },
      { forma: 'tarjeta',  monto: 1775.00 },
    ];
    await service.cerrarCaja(1, 6438.00, undefined, undefined, undefined, { id: 1 }, undefined, declaradoPorForma);

    expect(d.repo.update).toHaveBeenCalled();
    const [, cambios] = d.repo.update.mock.calls[0];

    const porForma = Object.fromEntries(cambios.cuadrePorFormaPago.map((f: any) => [f.forma, f]));
    expect(porForma.efectivo).toEqual({ forma: 'efectivo', esperado: 5608.06, declarado: 6438.00, diferencia: 829.94 });
    expect(porForma.tarjeta).toEqual({ forma: 'tarjeta', esperado: 2605.00, declarado: 1775.00, diferencia: -830.00 });

    expect(cambios.sospechasFormaPago).toHaveLength(1);
    expect(cambios.sospechasFormaPago[0]).toMatchObject({
      formaSobrante: 'efectivo', formaFaltante: 'tarjeta',
      monto: 829.94, montoSobrante: 829.94, montoFaltante: -830.00,
    });

    // El diferencia GLOBAL (saldoFisico - saldoCierre, solo efectivo) sigue
    // existiendo tal cual — para que nadie pierda el número con el que ya
    // está familiarizado — pero ya no es la única señal: el cuadre por forma
    // es el que explica qué pasó de verdad.
    expect(cambios.diferencia).toBe(829.94);
  });

  // Reimpresión real del mismo cierre (2026-10-10): si ese turno tiene
  // además una factura CONTADO sin forma de pago (FAC-1807, RD$295), su
  // monto NUNCA debe inflar "otros" — queda fuera del cuadre, y el neto
  // sigue siendo -0.06, no -295.06.
  it('una factura sin forma de pago en el mismo turno no infla "otros" ni cambia el neto', async () => {
    const d = buildDeps();
    const FAC_1807 = { id: 1807, folio: 'FAC-1807', total: '295.00', clienteNombre: 'Bellamar González' };
    d.dataSource.manager.query.mockImplementation((sql: string) => {
      if (sql.includes('recibos_cobro') && sql.includes('tarjeta')) return Promise.resolve([{ tarjeta: '0', transferencia: '0' }]);
      if (sql.includes('anticipo_cliente') && sql.includes('tarjeta')) return Promise.resolve([{ tarjeta: '0', transferencia: '0' }]);
      if (sql.includes('recibos_cobro') || sql.includes('anticipo_cliente')) return Promise.resolve([{ total: '0' }]);
      if (sql.includes('jsonb_array_length') && sql.includes('> 1')) return Promise.resolve([]); // sin candidatas en este caso
      if (sql.includes('FROM facturas f')) return Promise.resolve([FAC_1807]);
      return Promise.resolve([{}]);
    });
    d.repo.findOne.mockResolvedValue(cajaAbierta({
      id: 1, userId: 1, vendedorId: 12, vendedorNombre: 'Bellamar González',
      saldoApertura: 0, ventasEfectivo: 5608.06, ventasTarjeta: 2605.00,
      ventasCredito: 295.00, // el fallback histórico de clasificación por notas contó FAC-1807 aquí
    }));
    const service = buildService(d);

    const declaradoPorForma = [
      { forma: 'efectivo', monto: 6438.00 },
      { forma: 'tarjeta',  monto: 1775.00 },
    ];
    await service.cerrarCaja(1, 6438.00, undefined, undefined, undefined, { id: 1 }, undefined, declaradoPorForma);

    const [, cambios] = d.repo.update.mock.calls[0];
    const porForma = Object.fromEntries(cambios.cuadrePorFormaPago.map((f: any) => [f.forma, f]));
    expect(porForma.otros).toMatchObject({ esperado: 0, declarado: 0, diferencia: 0 });
    expect(cambios.facturasSinFormaPago).toEqual([FAC_1807]);

    const neto = cambios.cuadrePorFormaPago.reduce((s: number, f: any) => s + f.diferencia, 0);
    expect(Number(neto.toFixed(2))).toBe(-0.06);
  });

  it('sin declaradoPorForma (compat): declarado solo entra en efectivo, igual que antes', async () => {
    const d = buildDeps();
    mockQueryPorSql(d);
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, ventasEfectivo: 500 }));
    const service = buildService(d);

    await service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1 });

    const [, cambios] = d.repo.update.mock.calls[0];
    const porForma = Object.fromEntries(cambios.cuadrePorFormaPago.map((f: any) => [f.forma, f]));
    expect(porForma.efectivo).toMatchObject({ esperado: 500, declarado: 500, diferencia: 0 });
    expect(porForma.tarjeta).toMatchObject({ declarado: 0 });
    expect(cambios.sospechasFormaPago).toEqual([]);
  });
});

// Fix real (2026-10-13): una factura a CRÉDITO (tipoPago='CREDITO') se
// clasificaba vía el tipo DGII 4 ("Venta a Crédito" en formasPago — una
// declaración fiscal del e-CF, no dinero físico) y se sumaba al esperado de
// "Otros" del cuadre. Eso generaba un faltante falso: una factura a crédito
// de RD$90.00 convertía un faltante real de -1.13 en uno reportado de
// -91.13. Las facturas a crédito ahora quedan FUERA del cuadre (ningún
// bucket las suma) y se muestran aparte, como dato informativo — una venta
// a crédito es normal, a diferencia de una de contado sin forma de pago.
describe('CajaService.cerrarCaja — facturas a crédito fuera del cuadre (caso real)', () => {
  const FAC_CREDITO   = { id: 901, folio: 'FAC-CRED', total: '90.00',  clienteNombre: 'Cliente Crédito' };
  const FAC_SIN_FORMA = { id: 902, folio: 'FAC-SINF', total: '100.00', clienteNombre: 'Cliente Contado' };

  function mockTurnoMixto(d: ReturnType<typeof buildDeps>) {
    d.dataSource.manager.query.mockImplementation((sql: string) => {
      // Un recibo de cobro de la factura a crédito, cobrado por transferencia
      // DURANTE este turno — ESE sí entra al cuadre, en su forma real.
      if (sql.includes('recibos_cobro') && sql.includes('tarjeta'))
        return Promise.resolve([{ tarjeta: '0', transferencia: '500.00' }]);
      if (sql.includes('anticipo_cliente') && sql.includes('tarjeta'))
        return Promise.resolve([{ tarjeta: '0', transferencia: '0' }]);
      if (sql.includes('recibos_cobro') || sql.includes('anticipo_cliente'))
        return Promise.resolve([{ total: '0' }]);
      if (sql.includes('jsonb_array_length') && sql.includes('> 1'))
        return Promise.resolve([]); // sin candidatas a "forma mal registrada"
      if (sql.includes('FROM facturas f') && sql.includes("'CREDITO'"))
        return Promise.resolve([FAC_CREDITO]); // getFacturasCredito
      if (sql.includes('FROM facturas f') && sql.includes("'CONTADO'"))
        return Promise.resolve([FAC_SIN_FORMA]); // getFacturasSinFormaPago
      return Promise.resolve([{}]);
    });
  }

  it('contado + crédito + un recibo de cobro + contado sin forma — cada uno en su lugar, sin faltante falso', async () => {
    const d = buildDeps();
    mockTurnoMixto(d);
    d.repo.findOne.mockResolvedValue(cajaAbierta({
      id: 1, userId: 1, vendedorId: 12, vendedorNombre: 'Cajero',
      saldoApertura: 0,
      ventasEfectivo: 1000,   // la venta de CONTADO del turno, pagada en efectivo
      ventasCredito:  90,     // FAC-CRED — el fallback histórico la clasifica aquí, pero ya no cuenta
    }));
    const service = buildService(d);

    const declaradoPorForma = [
      { forma: 'transferencia', monto: 500 }, // el recibo de cobro de FAC-CRED
    ];
    await service.cerrarCaja(1, 1000, undefined, undefined, undefined, { id: 1 }, undefined, declaradoPorForma);

    const [, cambios] = d.repo.update.mock.calls[0];
    const porForma = Object.fromEntries(cambios.cuadrePorFormaPago.map((f: any) => [f.forma, f]));

    // Efectivo: solo la venta de contado — cuadra exacto.
    expect(porForma.efectivo).toMatchObject({ esperado: 1000, declarado: 1000, diferencia: 0 });
    // Transferencia: el COBRO de la factura a crédito — SÍ entra, en su forma real.
    expect(porForma.transferencia).toMatchObject({ esperado: 500, declarado: 500, diferencia: 0 });
    // Otros: la factura a crédito NO aparece aquí — nunca infló "otros".
    expect(porForma.otros).toMatchObject({ esperado: 0, declarado: 0, diferencia: 0 });

    // El faltante falso de -91.13 (caso real) no puede volver a pasar: el
    // neto es exactamente 0, no -90.
    const neto = cambios.cuadrePorFormaPago.reduce((s: number, f: any) => s + f.diferencia, 0);
    expect(Number(neto.toFixed(2))).toBe(0);

    // Cada factura en su sección — nunca la misma en las dos.
    expect(cambios.facturasCredito).toEqual([FAC_CREDITO]);
    expect(cambios.facturasSinFormaPago).toEqual([FAC_SIN_FORMA]);

    // No dispara "posible forma mal registrada" — nada de esto es un error.
    expect(cambios.sospechasFormaPago).toEqual([]);
  });

  it('el umbral de faltante de efectivo no se entera de la factura a crédito — no cuenta como faltante', async () => {
    const d = buildDeps();
    mockTurnoMixto(d);
    d.repo.findOne.mockResolvedValue(cajaAbierta({
      id: 1, userId: 1, vendedorId: 12, vendedorNombre: 'Cajero',
      saldoApertura: 0, ventasEfectivo: 1000, ventasCredito: 90,
    }));
    const service = buildService(d);

    const declaradoPorForma = [{ forma: 'transferencia', monto: 500 }];
    await service.cerrarCaja(1, 1000, undefined, undefined, undefined, { id: 1 }, undefined, declaradoPorForma);

    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.fueraDeUmbral).toBe(false); // el efectivo cuadra exacto — ningún "faltante" fantasma
  });
});

// Prestamista Etapa 5, Parte B — ver
// docs/prestamista/etapa-5-contabilidad-caja-fiscal.md. El efectivo de
// préstamos (cobros de cuota y desembolsos) entra al cierre de caja del
// cajero, con un interruptor por empresa.
describe('CajaService.cerrarCaja — efectivo de préstamos por caja (Etapa 5)', () => {
  function mockConPrestamo(d: ReturnType<typeof buildDeps>, opts: {
    cobrosPrestamoEfectivo?: string; desembolsosPrestamoEfectivo?: string;
    prestamoTarjeta?: string; prestamoTransferencia?: string;
    prestamoEfectivoPorCaja?: boolean;
  }) {
    d.dataSource.manager.query.mockImplementation((sql: string) => {
      if (sql.includes('recibos_cobro') && sql.includes('tarjeta')) return Promise.resolve([{ tarjeta: '0', transferencia: '0' }]);
      if (sql.includes('anticipo_cliente') && sql.includes('tarjeta')) return Promise.resolve([{ tarjeta: '0', transferencia: '0' }]);
      if (sql.includes('recibos_cobro') || sql.includes('anticipo_cliente')) return Promise.resolve([{ total: '0' }]);
      if (sql.includes('FROM facturas f')) return Promise.resolve([]);
      if (sql.includes('configuracion FROM empresa')) {
        return Promise.resolve([{ configuracion: opts.prestamoEfectivoPorCaja === false ? { prestamoEfectivoPorCaja: false } : {} }]);
      }
      if (sql.includes('FROM pr_pagos p') && sql.includes('tarjeta')) {
        return Promise.resolve([{ tarjeta: opts.prestamoTarjeta ?? '0', transferencia: opts.prestamoTransferencia ?? '0' }]);
      }
      if (sql.includes('FROM pr_pagos p')) {
        return Promise.resolve([{ total: opts.cobrosPrestamoEfectivo ?? '0' }]);
      }
      if (sql.includes('FROM pr_desembolsos_parciales')) {
        return Promise.resolve([{ total: opts.desembolsosPrestamoEfectivo ?? '0' }]);
      }
      return Promise.resolve([{}]);
    });
  }

  it('interruptor ON: un cobro de cuota y un desembolso en efectivo en el mismo turno ajustan el efectivo esperado (sube/baja) y se escriben en el cierre', async () => {
    const d = buildDeps();
    mockConPrestamo(d, { cobrosPrestamoEfectivo: '500', desembolsosPrestamoEfectivo: '200' });
    // `fresh` simula lo que recalcularDesdeBD ya escribió — mismo patrón que
    // el resto de esta suite para ventasEfectivo/cobrosEfectivo.
    d.repo.findOne.mockResolvedValue(cajaAbierta({
      id: 1, userId: 1, saldoApertura: 1000,
      cobrosPrestamoEfectivo: 500, desembolsosPrestamoEfectivo: 200,
    } as any));
    const service = buildService(d);

    await service.cerrarCaja(1, 1300, undefined, undefined, undefined, { id: 1 });

    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.saldoCierre).toBe(1300); // 1000 + 500 (cobro) − 200 (desembolso)
    expect(cambios.diferencia).toBe(0);

    const updateManager = d.dataSource.manager.update.mock.calls.find(
      ([entity]: any[]) => entity && entity.name === 'CierreCaja',
    ) ?? d.dataSource.manager.update.mock.calls[0];
    expect(updateManager[2].cobrosPrestamoEfectivo).toBe(500);
    expect(updateManager[2].desembolsosPrestamoEfectivo).toBe(200);
  });

  it('interruptor OFF: las queries nuevas nunca se ejecutan y las columnas quedan en 0', async () => {
    const d = buildDeps();
    mockConPrestamo(d, {
      cobrosPrestamoEfectivo: '500', desembolsosPrestamoEfectivo: '200', prestamoEfectivoPorCaja: false,
    });
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, saldoApertura: 1000 } as any));
    const service = buildService(d);

    await service.cerrarCaja(1, 1000, undefined, undefined, undefined, { id: 1 });

    expect(d.dataSource.manager.query.mock.calls.some(([sql]: any[]) => sql.includes('FROM pr_pagos p'))).toBe(false);
    expect(d.dataSource.manager.query.mock.calls.some(([sql]: any[]) => sql.includes('FROM pr_desembolsos_parciales'))).toBe(false);

    const updateManager = d.dataSource.manager.update.mock.calls[0];
    expect(updateManager[2].cobrosPrestamoEfectivo).toBe(0);
    expect(updateManager[2].desembolsosPrestamoEfectivo).toBe(0);
  });

  it('un cobro de cuota por tarjeta/transferencia entra al bucket correcto, no al de efectivo', async () => {
    const d = buildDeps();
    mockConPrestamo(d, { prestamoTarjeta: '300', prestamoTransferencia: '150' });
    d.repo.findOne.mockResolvedValue(cajaAbierta({
      id: 1, userId: 1, saldoApertura: 0, ventasEfectivo: 500,
    } as any));
    const service = buildService(d);

    const declaradoPorForma = [
      { forma: 'tarjeta', monto: 300 },
      { forma: 'transferencia', monto: 150 },
    ];
    await service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1 }, undefined, declaradoPorForma);

    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.saldoCierre).toBe(500); // el efectivo NUNCA ve el préstamo por tarjeta/transferencia
    const porForma = Object.fromEntries(cambios.cuadrePorFormaPago.map((f: any) => [f.forma, f]));
    expect(porForma.tarjeta.esperado).toBe(300);
    expect(porForma.transferencia.esperado).toBe(150);
  });

  // Aislamiento multi-tenant (ver docs/prestamista/decisiones-pendientes.md,
  // punto 14, y merge-readiness.md sección 2): el switch de configuración
  // por sí solo NO basta — una empresa SIN el add-on 'prestamista' activo
  // (tabla empresa_modulos) nunca debe pagar las 2 queries extra contra
  // pr_pagos/pr_desembolsos_parciales, sin importar que el switch quede en
  // su default `true`.
  it('SIN el add-on prestamista activo: las 2 queries extra nunca se ejecutan, aunque el switch esté en true (default)', async () => {
    const d = buildDeps();
    // El switch de configuración queda en su default (true) — la única
    // diferencia de este test es que el add-on NO está activo.
    mockConPrestamo(d, { cobrosPrestamoEfectivo: '500', desembolsosPrestamoEfectivo: '200' });
    d.modulosAddonSvc.checkModuloActivo.mockResolvedValue(false);
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, saldoApertura: 1000 } as any));
    const service = buildService(d);

    await service.cerrarCaja(1, 1000, undefined, undefined, undefined, { id: 1 });

    // Las 2 queries contra las tablas de Prestamista NUNCA corrieron.
    expect(d.dataSource.manager.query.mock.calls.some(([sql]: any[]) => sql.includes('FROM pr_pagos p'))).toBe(false);
    expect(d.dataSource.manager.query.mock.calls.some(([sql]: any[]) => sql.includes('FROM pr_desembolsos_parciales'))).toBe(false);
    // Sí se consultó si el add-on estaba activo — ese es el gate real.
    expect(d.modulosAddonSvc.checkModuloActivo).toHaveBeenCalledWith(EMPRESA, 'prestamista');

    const updateManager = d.dataSource.manager.update.mock.calls[0];
    expect(updateManager[2].cobrosPrestamoEfectivo).toBe(0);
    expect(updateManager[2].desembolsosPrestamoEfectivo).toBe(0);
  });

  it('CON el add-on prestamista activo y filas reales en pr_pagos/pr_desembolsos_parciales: los cobros y desembolsos SÍ fluyen al cierre', async () => {
    const d = buildDeps();
    mockConPrestamo(d, { cobrosPrestamoEfectivo: '750', desembolsosPrestamoEfectivo: '300' });
    d.modulosAddonSvc.checkModuloActivo.mockResolvedValue(true);
    d.repo.findOne.mockResolvedValue(cajaAbierta({
      id: 1, userId: 1, saldoApertura: 1000,
      cobrosPrestamoEfectivo: 750, desembolsosPrestamoEfectivo: 300,
    } as any));
    const service = buildService(d);

    await service.cerrarCaja(1, 1450, undefined, undefined, undefined, { id: 1 });

    expect(d.dataSource.manager.query.mock.calls.some(([sql]: any[]) => sql.includes('FROM pr_pagos p'))).toBe(true);
    expect(d.dataSource.manager.query.mock.calls.some(([sql]: any[]) => sql.includes('FROM pr_desembolsos_parciales'))).toBe(true);
    expect(d.modulosAddonSvc.checkModuloActivo).toHaveBeenCalledWith(EMPRESA, 'prestamista');

    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.saldoCierre).toBe(1450); // 1000 + 750 (cobro) − 300 (desembolso)
    expect(cambios.diferencia).toBe(0);

    const updateManager = d.dataSource.manager.update.mock.calls.find(
      ([entity]: any[]) => entity && entity.name === 'CierreCaja',
    ) ?? d.dataSource.manager.update.mock.calls[0];
    expect(updateManager[2].cobrosPrestamoEfectivo).toBe(750);
    expect(updateManager[2].desembolsosPrestamoEfectivo).toBe(300);
  });
});

// Requisito de negocio (2026-10-10, segunda vuelta): la alerta por
// descuadre SOLO mira el FALTANTE de EFECTIVO (esperado > contado) — un
// sobrante de efectivo, o una diferencia de tarjeta/transferencia/otros/el
// neto, nunca la disparan por sí solos. Se evalúa SIEMPRE al cerrar (no
// solo con el cierre ciego activo). Al quedar fuera de umbral, el cierre se
// guarda IGUAL (nunca bloquea) y se notifica de inmediato a ADMIN/CONTADOR.
describe('CajaService.cerrarCaja — umbral de alerta por descuadre', () => {
  function mockQueryConUmbral(d: ReturnType<typeof buildDeps>, umbral?: number) {
    d.dataSource.manager.query.mockImplementation((sql: string) => {
      if (sql.includes('recibos_cobro') && sql.includes('tarjeta')) return Promise.resolve([{ tarjeta: '0', transferencia: '0' }]);
      if (sql.includes('anticipo_cliente') && sql.includes('tarjeta')) return Promise.resolve([{ tarjeta: '0', transferencia: '0' }]);
      if (sql.includes('recibos_cobro') || sql.includes('anticipo_cliente')) return Promise.resolve([{ total: '0' }]);
      if (sql.includes('jsonb_array_length') && sql.includes('> 1')) return Promise.resolve([]);
      if (sql.includes('FROM facturas f')) return Promise.resolve([]);
      if (sql.includes('configuracion FROM empresa')) {
        return Promise.resolve([{ configuracion: umbral != null ? { umbralDescuadreCaja: umbral } : {} }]);
      }
      return Promise.resolve([{}]);
    });
  }

  it('faltante de efectivo DENTRO del umbral (default 100): fueraDeUmbral=false, no notifica', async () => {
    const d = buildDeps();
    mockQueryConUmbral(d);
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, ventasEfectivo: 500 }));
    const service = buildService(d);

    await service.cerrarCaja(1, 450, undefined, undefined, undefined, { id: 1 }); // faltan 50, dentro de 100

    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.fueraDeUmbral).toBe(false);
    expect(d.notificacionesSvc.notificarDescuadreCierre).not.toHaveBeenCalled();
  });

  it('faltante de efectivo FUERA del umbral: fueraDeUmbral=true, notifica', async () => {
    const d = buildDeps();
    mockQueryConUmbral(d);
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, vendedorNombre: 'Maximo', ventasEfectivo: 500 }));
    const service = buildService(d);

    await service.cerrarCaja(1, 200, undefined, undefined, undefined, { id: 1 }); // faltan 300, > 100

    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.fueraDeUmbral).toBe(true);
    expect(d.notificacionesSvc.notificarDescuadreCierre).toHaveBeenCalledTimes(1);
    const [, detalle] = d.notificacionesSvc.notificarDescuadreCierre.mock.calls[0];
    expect(detalle.cajero).toBe('Maximo');
    expect(detalle.neto).toBe(-300);
  });

  it('SOBRANTE de efectivo: no alerta sin importar cuán grande sea', async () => {
    const d = buildDeps();
    mockQueryConUmbral(d);
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, ventasEfectivo: 500 }));
    const service = buildService(d);

    await service.cerrarCaja(1, 5000, undefined, undefined, undefined, { id: 1 }); // sobran 4500

    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.fueraDeUmbral).toBe(false);
    expect(d.notificacionesSvc.notificarDescuadreCierre).not.toHaveBeenCalled();
  });

  it('faltante de TARJETA con el efectivo cuadrado: no alerta — la regla solo mira el efectivo', async () => {
    const d = buildDeps();
    mockQueryConUmbral(d);
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, ventasEfectivo: 500, ventasTarjeta: 300 }));
    const service = buildService(d);

    const declaradoPorForma = [
      { forma: 'efectivo', monto: 500 },
      { forma: 'tarjeta', monto: 0, confirmado: true },
    ];
    await service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1 }, undefined, declaradoPorForma);

    const [, cambios] = d.repo.update.mock.calls[0];
    const porForma = Object.fromEntries(cambios.cuadrePorFormaPago.map((f: any) => [f.forma, f]));
    expect(porForma.efectivo.diferencia).toBe(0);
    expect(porForma.tarjeta.diferencia).toBe(-300);
    expect(cambios.fueraDeUmbral).toBe(false);
    expect(d.notificacionesSvc.notificarDescuadreCierre).not.toHaveBeenCalled();
  });

  it('caso real empresa 73 (umbral 100): efectivo SOBRANTE +829.94 / tarjeta -830.00 — ya no alerta bajo la nueva regla (solo importa el faltante de efectivo)', async () => {
    const d = buildDeps();
    mockQueryConUmbral(d, 100);
    d.repo.findOne.mockResolvedValue(cajaAbierta({
      id: 1, userId: 1, vendedorId: 12, vendedorNombre: 'Bellamar González',
      saldoApertura: 0, ventasEfectivo: 5608.06, ventasTarjeta: 2605.00,
    }));
    const service = buildService(d);

    const declaradoPorForma = [
      { forma: 'efectivo', monto: 6438.00 },
      { forma: 'tarjeta',  monto: 1775.00 },
    ];
    await service.cerrarCaja(1, 6438.00, undefined, undefined, undefined, { id: 1 }, undefined, declaradoPorForma);

    const [, cambios] = d.repo.update.mock.calls[0];
    const filaPorForma = Object.fromEntries(cambios.cuadrePorFormaPago.map((f: any) => [f.forma, f]));
    expect(filaPorForma.efectivo.diferencia).toBe(829.94);
    expect(filaPorForma.tarjeta.diferencia).toBe(-830.00);
    expect(cambios.fueraDeUmbral).toBe(false);
    expect(d.notificacionesSvc.notificarDescuadreCierre).not.toHaveBeenCalled();
  });

  it('umbral configurado distinto al default (500): un faltante de efectivo de 250 no alerta', async () => {
    const d = buildDeps();
    mockQueryConUmbral(d, 500);
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, ventasEfectivo: 500 }));
    const service = buildService(d);

    await service.cerrarCaja(1, 250, undefined, undefined, undefined, { id: 1 }); // faltan 250, < 500

    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.fueraDeUmbral).toBe(false);
    expect(d.notificacionesSvc.notificarDescuadreCierre).not.toHaveBeenCalled();
  });

  it('una falla al notificar NUNCA bloquea el cierre — la caja ya quedó cerrada y guardada', async () => {
    const d = buildDeps();
    mockQueryConUmbral(d);
    d.notificacionesSvc.notificarDescuadreCierre.mockRejectedValue(new Error('SMTP caído'));
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, ventasEfectivo: 500 }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 200, undefined, undefined, undefined, { id: 1 }), // faltan 300, > 100
    ).resolves.toBeDefined();
    expect(d.repo.update).toHaveBeenCalled();
  });

  it('notificarDescuadreCaja=false en configuración: queda fueraDeUmbral=true pero NO notifica', async () => {
    const d = buildDeps();
    d.dataSource.manager.query.mockImplementation((sql: string) => {
      if (sql.includes('recibos_cobro') && sql.includes('tarjeta')) return Promise.resolve([{ tarjeta: '0', transferencia: '0' }]);
      if (sql.includes('anticipo_cliente') && sql.includes('tarjeta')) return Promise.resolve([{ tarjeta: '0', transferencia: '0' }]);
      if (sql.includes('recibos_cobro') || sql.includes('anticipo_cliente')) return Promise.resolve([{ total: '0' }]);
      if (sql.includes('jsonb_array_length') && sql.includes('> 1')) return Promise.resolve([]);
      if (sql.includes('FROM facturas f')) return Promise.resolve([]);
      if (sql.includes('configuracion FROM empresa')) {
        return Promise.resolve([{ configuracion: { notificarDescuadreCaja: false } }]);
      }
      return Promise.resolve([{}]);
    });
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, ventasEfectivo: 500 }));
    const service = buildService(d);

    await service.cerrarCaja(1, 200, undefined, undefined, undefined, { id: 1 }); // faltan 300, > 100

    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.fueraDeUmbral).toBe(true);
    expect(d.notificacionesSvc.notificarDescuadreCierre).not.toHaveBeenCalled();
  });
});

// Requisito explícito (2026-10-10): el endpoint EXIGE la declaración por
// forma de pago y rechaza un cierre que solo trae efectivo cuando el turno
// tiene ventas con otras formas — así ningún formulario viejo o externo
// (como el de Caja Diaria, antes de unificarse con el del POS) puede volver
// a cerrar dejando tarjeta/transferencia en 0 sin que nadie se entere.
describe('CajaService.cerrarCaja — exige declarar toda forma con ventas en el turno', () => {
  function mockQueryPorSql(d: ReturnType<typeof buildDeps>) {
    d.dataSource.manager.query.mockImplementation((sql: string) => {
      if (sql.includes('recibos_cobro') && sql.includes('tarjeta')) return Promise.resolve([{ tarjeta: '0', transferencia: '0' }]);
      if (sql.includes('anticipo_cliente') && sql.includes('tarjeta')) return Promise.resolve([{ tarjeta: '0', transferencia: '0' }]);
      if (sql.includes('recibos_cobro') || sql.includes('anticipo_cliente')) return Promise.resolve([{ total: '0' }]);
      if (sql.includes('FROM facturas f')) return Promise.resolve([]);
      return Promise.resolve([{}]);
    });
  }

  it('rechaza un cierre que solo trae efectivo cuando el turno tuvo ventas por tarjeta', async () => {
    const d = buildDeps();
    mockQueryPorSql(d);
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, ventasEfectivo: 500, ventasTarjeta: 300 }));
    const service = buildService(d);

    // Sin declaradoPorForma — el formulario viejo de Caja Diaria, que solo pide efectivo.
    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1 }),
    ).rejects.toThrow(BadRequestException);
    expect(d.repo.update).not.toHaveBeenCalled();
  });

  it('rechaza igual aunque declaradoPorForma venga, si deja la tarjeta en 0 sin confirmar', async () => {
    const d = buildDeps();
    mockQueryPorSql(d);
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, ventasEfectivo: 500, ventasTarjeta: 300 }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1 }, undefined, [
        { forma: 'efectivo', monto: 500 },
        { forma: 'tarjeta', monto: 0 },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('acepta si la tarjeta se declara con un monto', async () => {
    const d = buildDeps();
    mockQueryPorSql(d);
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, ventasEfectivo: 500, ventasTarjeta: 300 }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1 }, undefined, [
        { forma: 'efectivo', monto: 500 },
        { forma: 'tarjeta', monto: 300 },
      ]),
    ).resolves.toBeDefined();
    expect(d.repo.update).toHaveBeenCalled();
  });

  it('acepta si confirma explícitamente que la tarjeta quedó en 0 (genuinamente no se cobró nada)', async () => {
    const d = buildDeps();
    mockQueryPorSql(d);
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, ventasEfectivo: 500, ventasTarjeta: 300 }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1 }, undefined, [
        { forma: 'efectivo', monto: 500 },
        { forma: 'tarjeta', monto: 0, confirmado: true },
      ]),
    ).resolves.toBeDefined();
    expect(d.repo.update).toHaveBeenCalled();
  });

  it('sin ventas en ninguna otra forma, no exige nada — el fallback solo-efectivo sigue funcionando', async () => {
    const d = buildDeps();
    mockQueryPorSql(d);
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, userId: 1, ventasEfectivo: 500 }));
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: 1 }),
    ).resolves.toBeDefined();
  });
});

// Bug real (2026-10-10): reimprimir el cierre de Bellamar González volvía al
// formato viejo porque ese cierre se cerró ANTES del fix — nunca tuvo
// cuadrePorFormaPago guardado. Sin derivarlo al leer, ni obtenerUnaPorId ni
// getHistorial (de donde sale todo lo que se imprime) traían la tabla.
describe('CajaService — cuadre legacy derivado para cierres anteriores al fix', () => {
  it('obtenerUnaPorId deriva el cuadre del caso real desde las columnas viejas (sin cuadrePorFormaPago guardado)', async () => {
    const d = buildDeps();
    d.dataSource.manager.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM facturas f')) return Promise.resolve([]); // sin facturas sin forma ni candidatas en este caso
      return Promise.resolve([{}]);
    });
    d.repo.findOne.mockResolvedValue(cajaAbierta({
      id: 1, estado: EstadoCierre.CERRADA,
      saldoCierre: 5608.06, saldoFisico: 6438.00, ventasTarjeta: 2605.00,
      desglosePago: { efectivo: '6438.00', tarjetaDebito: '1775.00' } as any,
      cuadrePorFormaPago: undefined,
    }));
    const service = buildService(d);

    const r: any = await service.obtenerUnaPorId(1);

    expect(r.cuadreEstimado).toBe(true);
    const porForma = Object.fromEntries(r.cuadrePorFormaPago.map((f: any) => [f.forma, f]));
    expect(porForma.efectivo).toEqual({ forma: 'efectivo', esperado: 5608.06, declarado: 6438.00, diferencia: 829.94 });
    expect(porForma.tarjeta).toEqual({ forma: 'tarjeta', esperado: 2605.00, declarado: 1775.00, diferencia: -830.00 });
    expect(r.sospechasFormaPago).toEqual([
      { formaSobrante: 'efectivo', formaFaltante: 'tarjeta', monto: 829.94, montoSobrante: 829.94, montoFaltante: -830.00, facturasCandidatas: [] },
    ]);
  });

  // Reimpresión real del caso (2026-10-10): FAC-1807 (RD$295, sin forma de
  // pago) entraba al cuadre dentro de "otros" e inflaba ventasCredito con un
  // monto que nadie declaró — el neto salía -295.06 en vez de -0.06. Y la
  // sospecha no traía ninguna candidata real para FAC-1803.
  it('FAC-1807 (sin forma de pago) queda FUERA del cuadre — no infla "otros", el neto es -0.06, y la sospecha trae FAC-1803 como candidata real', async () => {
    const d = buildDeps();
    const FAC_1807 = { id: 1807, folio: 'FAC-1807', total: '295.00', clienteNombre: 'Bellamar González' };
    const FAC_1803 = { id: 1803, folio: 'FAC-1803', total: '1080.00', formasPago: [{ tipo: 3, monto: 955 }, { tipo: 1, monto: 125 }] };
    d.dataSource.manager.query.mockImplementation((sql: string) => {
      if (sql.includes('jsonb_array_length') && sql.includes('> 1')) return Promise.resolve([FAC_1803]); // buscarFacturasCandidatasSospecha
      if (sql.includes('FROM facturas f')) return Promise.resolve([FAC_1807]); // getFacturasSinFormaPago
      return Promise.resolve([{}]);
    });
    d.repo.findOne.mockResolvedValue(cajaAbierta({
      id: 1, estado: EstadoCierre.CERRADA,
      saldoCierre: 5608.06, saldoFisico: 6438.00, ventasTarjeta: 2605.00,
      ventasCredito: 295.00, // el fallback histórico de clasificación por notas contó FAC-1807 aquí
      desglosePago: { efectivo: '6438.00', tarjetaDebito: '1775.00' } as any,
      cuadrePorFormaPago: undefined,
    }));
    const service = buildService(d);

    const r: any = await service.obtenerUnaPorId(1);

    const porForma = Object.fromEntries(r.cuadrePorFormaPago.map((f: any) => [f.forma, f]));
    expect(porForma.otros).toMatchObject({ esperado: 0, declarado: 0, diferencia: 0 }); // 295 - 295 = 0, no 295
    expect(r.facturasSinFormaPago).toEqual([FAC_1807]);

    const neto = r.cuadrePorFormaPago.reduce((s: number, f: any) => s + f.diferencia, 0);
    expect(Number(neto.toFixed(2))).toBe(-0.06);

    expect(r.sospechasFormaPago[0].facturasCandidatas).toEqual([FAC_1803]);
  });

  it('un cierre YA con cuadrePorFormaPago guardado no se toca ni se marca estimado', async () => {
    const d = buildDeps();
    const snapshotReal = [{ forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 }];
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, estado: EstadoCierre.CERRADA, cuadrePorFormaPago: snapshotReal as any }));
    const service = buildService(d);

    const r: any = await service.obtenerUnaPorId(1);

    expect(r.cuadrePorFormaPago).toBe(snapshotReal);
    expect(r.cuadreEstimado).toBeUndefined();
  });

  it('una caja ABIERTA nunca deriva cuadre legacy (todavía no hay nada que cuadrar)', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, estado: EstadoCierre.ABIERTA }));
    const service = buildService(d);

    const r: any = await service.obtenerUnaPorId(1);

    expect(r.cuadrePorFormaPago).toBeUndefined();
  });
});

// Requisito explícito (2026-10-10): si una factura del turno se corrigió
// DESPUÉS de cerrar, el reporte muestra el cuadre ORIGINAL y el CORREGIDO
// uno junto al otro — el cierre guardado nunca se reescribe.
describe('CajaService — cuadreCorregido cuando el cierre tiene un ajuste posterior', () => {
  it('obtenerUnaPorId agrega cuadreCorregido aplicando el ajuste sobre el cuadre original', async () => {
    const d = buildDeps();
    const cuadreOriginal = [
      { forma: 'efectivo', esperado: 5608.06, declarado: 6438.00, diferencia: 829.94 },
      { forma: 'tarjeta',  esperado: 2605.00, declarado: 1775.00, diferencia: -830.00 },
    ];
    d.repo.findOne.mockResolvedValue(cajaAbierta({
      id: 1, estado: EstadoCierre.CERRADA, cuadrePorFormaPago: cuadreOriginal as any,
    }));
    const ajuste = {
      cierreCajaId: 1,
      formasPagoAnterior: [{ tipo: 3, monto: 955 }, { tipo: 1, monto: 125 }],
      formasPagoNuevo:    [{ tipo: 1, monto: 955 }, { tipo: 3, monto: 125 }],
    };
    d.dataSource.manager.getRepository = jest.fn(() => ({ find: jest.fn().mockResolvedValue([ajuste]) })) as any;
    const service = buildService(d);

    const r: any = await service.obtenerUnaPorId(1);

    expect(r.cuadrePorFormaPago).toBe(cuadreOriginal); // el original NO se altera
    const corregidoPorForma = Object.fromEntries(r.cuadreCorregido.map((f: any) => [f.forma, f]));
    expect(corregidoPorForma.efectivo).toEqual({ forma: 'efectivo', esperado: 6438.06, declarado: 6438.00, diferencia: -0.06 });
    expect(corregidoPorForma.tarjeta).toEqual({ forma: 'tarjeta', esperado: 1775.00, declarado: 1775.00, diferencia: 0 });
  });

  it('sin ajustes, no agrega cuadreCorregido', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({
      id: 1, estado: EstadoCierre.CERRADA,
      cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 }] as any,
    }));
    const service = buildService(d);

    const r: any = await service.obtenerUnaPorId(1);

    expect(r.cuadreCorregido).toBeUndefined();
  });
});

// Caso real (caja #714, empresa 44, 2026-10-03): un access token renovado por
// /auth/refresh no traía sucursalId → abrirCaja() la escribía en silencio
// como NULL. Ahora corta con 400 en vez de crear la caja sin sucursal.
describe('CajaService.abrirCaja — sucursalId obligatorio', () => {
  it('sin sucursalId en el CLS: 400, no toca la BD', async () => {
    const d = buildDeps();
    d.tenantSvc.getSucursalId = () => undefined;
    const service = buildService(d);

    await expect(service.abrirCaja(1, 500)).rejects.toThrow(BadRequestException);

    expect(d.repo.findOne).not.toHaveBeenCalled();
    expect(d.repo.save).not.toHaveBeenCalled();
  });
});

// Caso real (2026-10-04): una caja abierta un día y nunca cerrada quedaba
// invisible — "No hay cajas abiertas hoy" solo mira fecha = hoy.
describe('CajaService.getCajasAbiertas', () => {
  it('cada fila trae diasAbierta: 0 para una abierta hoy, >0 para una huérfana de ayer', async () => {
    const d = buildDeps();
    const hoy  = fechaHoyRD();
    const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86_400_000).toISOString().substring(0, 10);

    const cajaHoyRow  = cajaAbierta({ id: 1, fecha: new Date(`${hoy}T00:00:00Z`) as any, vendedorNombre: 'Elvia' });
    const cajaAyerRow = cajaAbierta({ id: 2, fecha: new Date(`${ayer}T00:00:00Z`) as any, vendedorNombre: 'Maximo' });
    d.repo.find.mockResolvedValue([cajaAyerRow, cajaHoyRow]); // misma lista en las dos consultas (antes/después de recalcular)

    const service = buildService(d);
    const result: any[] = await service.getCajasAbiertas();

    const porId = new Map(result.map(r => [r.id, r]));
    expect(porId.get(1).diasAbierta).toBe(0);
    expect(porId.get(2).diasAbierta).toBe(1);
  });

  it('solo trae estado ABIERTA de la empresa activa', async () => {
    const d = buildDeps();
    d.repo.find.mockResolvedValue([]);
    const service = buildService(d);

    await service.getCajasAbiertas();

    expect(d.repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { empresaId: EMPRESA, estado: EstadoCierre.ABIERTA } }),
    );
  });
});

// Caso real (2026-10-04): el historial listaba las ABIERTA mezcladas por
// fecha — una huérfana de hace varios días podía quedar varias páginas abajo.
describe('CajaService.getHistorial — ABIERTA siempre primero', () => {
  it('ordena por estado=abierta antes que por fecha', async () => {
    const d = buildDeps();
    const qb: any = {
      where:      jest.fn().mockReturnThis(),
      andWhere:   jest.fn().mockReturnThis(),
      orderBy:    jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip:       jest.fn().mockReturnThis(),
      take:       jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[cajaAbierta({ id: 1 })], 1]),
    };
    d.repo.createQueryBuilder.mockReturnValue(qb);
    const service = buildService(d);

    await service.getHistorial(1, 20);

    expect(qb.orderBy).toHaveBeenCalledWith(`CASE WHEN c.estado = 'abierta' THEN 0 ELSE 1 END`, 'ASC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('c.fecha', 'DESC');
  });

  // Caso real (caja #714, empresa 44, 2026-10-03): con sucursalId activa en
  // la sesión, el filtro `c.sucursalId = :sucursalId` excluía en silencio
  // las cajas con sucursalId NULL — la de Maximo nunca apareció en el
  // historial. Deben verse siempre (el frontend las marca "Sin sucursal").
  it('con sucursal activa en la sesión: incluye también las cajas con sucursalId NULL, no solo las de esa sucursal', async () => {
    const d = buildDeps();
    d.tenantSvc.getSucursalId = () => 45;
    const qb: any = {
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    d.repo.createQueryBuilder.mockReturnValue(qb);
    const service = buildService(d);

    await service.getHistorial(1, 20);

    expect(qb.andWhere).toHaveBeenCalledWith(
      '(c.sucursalId = :sucursalId OR c.sucursalId IS NULL)', { sucursalId: 45 },
    );
  });

  it('una fila ABIERTA en el historial trae efectivoEsperado calculado (no undefined) — para que "Cerrar caja" desde ahí arranque con el número real', async () => {
    const d = buildDeps();
    const qb: any = {
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[cajaAbierta({ id: 1, saldoApertura: 1000 })], 1]),
    };
    d.repo.createQueryBuilder.mockReturnValue(qb);
    const service = buildService(d);

    const { data } = await service.getHistorial(1, 20);

    expect((data[0] as any).efectivoEsperado).toBeDefined();
  });
});

/**
 * Cierre de Caja — VENDEDOR nunca ve el balance/monto de una caja ABIERTA
 * (decisión 2026-10-09): ni en Historial, ni en Cierre Actual, ni en
 * ningún resumen. ADMIN/CONTADOR: sin cambios, ven e imprimen todo. Las
 * cajas CERRADAS tampoco cambian para nadie.
 *
 * Mismo criterio de fakes que el resto del archivo, con un helper propio
 * (makeCajaService/cajaBase) porque estos casos necesitan findOne() por id
 * y un facturas-detalle con datos reales — buildDeps()/cajaAbierta() de
 * arriba ya bastaban para los suyos y no hacía falta tocarlos.
 */
function cajaBase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1, fecha: new Date('2026-10-09'), vendedorId: 10, vendedorNombre: 'Bellamar González',
    sucursalId: null, estado: EstadoCierre.ABIERTA,
    saldoApertura: 500, ventasEfectivo: 1200, ventasTarjeta: 300, ventasTransferencia: 50,
    ventasCredito: 0, cobrosRecibidos: 80, cobrosEfectivo: 80, cobrosOtrosMedios: 0,
    totalAnticipos: 0, anticiposEfectivo: 0, anticiposOtrosMedios: 0,
    gastosEfectivo: 20, retiros: 0, saldoCierre: 0, saldoFisico: 0, diferencia: 0,
    cantidadTransacciones: 5, empresaId: EMPRESA, userId: 1,
    ...overrides,
  };
}

function makeCajaService(opts: { cajas?: any[]; facturas?: any[]; cierreCajaCiego?: boolean; rol?: string | null } = {}) {
  const cajas = opts.cajas ?? [cajaBase()];
  const facturas = opts.facturas ?? [];

  const repo = {
    findOne: jest.fn(async ({ where }: any) => {
      if (where?.id != null) {
        const found = cajas.find(c => c.id === where.id && (where?.empresaId == null || c.empresaId === where.empresaId));
        return found ?? null;
      }
      // getCajaHoy(vendedorId) busca por {fecha, empresaId, vendedorId} — sin
      // id. El fake no reimplementa fecha/IsNull(); basta con vendedorId para
      // los tests de este bloque, que solo tienen UNA caja relevante.
      if (where?.vendedorId != null && typeof where.vendedorId !== 'object') {
        const found = cajas.find(c => c.vendedorId === where.vendedorId && (where?.empresaId == null || c.empresaId === where.empresaId));
        return found ?? null;
      }
      return cajas[0] ?? null;
    }),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        where: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        orderBy: jest.fn(() => qb),
        addOrderBy: jest.fn(() => qb),
        skip: jest.fn(() => qb),
        take: jest.fn(() => qb),
        getManyAndCount: jest.fn(async () => [cajas, cajas.length]),
        // getCajaHoyByUserId no filtra por los predicados reales en este fake
        // (el repo no reimplementa SQL) — basta con devolver la primera caja,
        // cada test de este bloque solo tiene UNA caja relevante.
        getOne: jest.fn(async () => cajas[0] ?? null),
      };
      return qb;
    }),
  };

  const dataSource = {
    // SELECT configuracion FROM empresa — getEmpresaCfg()
    query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT configuracion FROM empresa')) {
        return [{ configuracion: { cierreCajaCiego: opts.cierreCajaCiego === true } }];
      }
      // getFacturasDetalle: lookup del perfil de vendedor (usuarioId→vendedorId) y las facturas del turno
      if (sql.includes('FROM vendedores')) return [];
      if (sql.includes('FROM facturas f')) {
        return facturas.map(f => ({
          id: f.id, folio: f.folio, encf: f.encf ?? null, hora: f.hora ?? new Date(),
          clienteNombre: f.clienteNombre ?? 'Consumidor Final', formasPago: f.formasPago ?? [],
          subtotal: String(f.subtotal ?? 0), iva: String(f.iva ?? 0), total: String(f.total ?? 0),
          estado: f.estado ?? 'emitida',
        }));
      }
      return [{}];
    }),
    manager: {
      // recalcularDesdeBD — no importa el cuadre recalculado en estas pruebas.
      query: jest.fn(async () => [{}]),
      update: jest.fn(async () => undefined),
      // conCuadreCorregido() — sin ajustes por defecto en este bloque de tests.
      getRepository: jest.fn(() => ({ find: jest.fn().mockResolvedValue([]) })),
    },
  };

  // getRolEmpresa: el rol de la empresa ACTIVA — igual que buildDeps() más
  // arriba, nunca `usuario.role`. null por defecto (sin rol resuelto);
  // cada test que lo necesite pasa opts.rol.
  const tenantService = { getEmpresaId: () => EMPRESA, getSucursalId: () => null, getRolEmpresa: () => opts.rol ?? null };
  const realtimeService = { notify: jest.fn() };
  const notificacionesService = { notificarDescuadreCierre: jest.fn().mockResolvedValue(undefined) };
  // Default: add-on 'prestamista' activo — este bloque de tests no es sobre
  // Prestamista, preserva el comportamiento previo a la existencia del gate.
  const modulosAddonService = { checkModuloActivo: jest.fn().mockResolvedValue(true) };

  const svc = new CajaService(
    repo as any, {} as any, dataSource as any, tenantService as any, realtimeService as any,
    notificacionesService as any, modulosAddonService as any,
  );
  return { svc, cajas, dataSource, repo, modulosAddonService };
}

describe('CajaService.obtenerUnaPorId — VENDEDOR nunca ve el monto de una caja ABIERTA', () => {
  it('VENDEDOR + caja ABIERTA: los montos se recortan y queda marcada ciegoCajaActivo', async () => {
    const { svc } = makeCajaService({ rol: UserRole.VENDEDOR });
    const r = await svc.obtenerUnaPorId(1);

    expect(r.ciegoCajaActivo).toBe(true);
    for (const campo of ['ventasEfectivo', 'ventasTarjeta', 'ventasTransferencia', 'ventasCredito',
      'cobrosRecibidos', 'cobrosEfectivo', 'cobrosOtrosMedios', 'totalAnticipos',
      'anticiposEfectivo', 'anticiposOtrosMedios', 'gastosEfectivo', 'retiros',
      'saldoCierre', 'diferencia', 'cantidadTransacciones',
      'efectivoEsperado', 'esperadoInconsistente', 'excesoRetiros']) {
      expect(r).not.toHaveProperty(campo);
    }
    // El estado y el id SIGUEN visibles — el frontend necesita saber que está
    // abierta para decidir qué pedir/ofrecer (p.ej. el botón de imprimir).
    expect(r.estado).toBe('abierta');
    expect(r.id).toBe(1);
  });

  it('VENDEDOR + caja CERRADA: sin cambios — los montos se ven completos', async () => {
    const { svc } = makeCajaService({ rol: UserRole.VENDEDOR, cajas: [cajaBase({ estado: EstadoCierre.CERRADA, saldoCierre: 1550 })] });
    const r = await svc.obtenerUnaPorId(1);

    expect(r.ciegoCajaActivo).toBeUndefined();
    expect(r.ventasEfectivo).toBe(1200);
    expect(r.saldoCierre).toBe(1550);
  });

  it('ADMIN + caja ABIERTA: sin cambios — ve todo', async () => {
    const { svc } = makeCajaService({ rol: UserRole.ADMIN });
    const r = await svc.obtenerUnaPorId(1);

    expect(r.ciegoCajaActivo).toBeUndefined();
    expect(r.ventasEfectivo).toBe(1200);
    expect(r.efectivoEsperado).toEqual(expect.any(Number));
  });

  it('CONTADOR + caja ABIERTA: sin cambios — ve todo', async () => {
    const { svc } = makeCajaService({ rol: UserRole.CONTADOR });
    const r = await svc.obtenerUnaPorId(1);

    expect(r.ciegoCajaActivo).toBeUndefined();
    expect(r.ventasEfectivo).toBe(1200);
  });

  it('caja inexistente: NotFoundException, para cualquier rol', async () => {
    const { svc } = makeCajaService({ rol: UserRole.VENDEDOR });
    await expect(svc.obtenerUnaPorId(999)).rejects.toThrow(NotFoundException);
  });
});

describe('CajaService.getHistorial — recorta SOLO las filas ABIERTA cuando el rol es VENDEDOR', () => {
  it('VENDEDOR: la fila CERRADA sale completa, la ABIERTA sale recortada, en la MISMA respuesta', async () => {
    const { svc } = makeCajaService({
      rol: UserRole.VENDEDOR,
      cajas: [
        cajaBase({ id: 1, estado: EstadoCierre.ABIERTA }),
        cajaBase({ id: 2, estado: EstadoCierre.CERRADA, saldoCierre: 900 }),
      ],
    });
    const { data } = await svc.getHistorial(1, 20);

    const abierta = data.find((c: any) => c.id === 1);
    const cerrada = data.find((c: any) => c.id === 2);
    expect(abierta.ciegoCajaActivo).toBe(true);
    expect(abierta.ventasEfectivo).toBeUndefined();
    expect(cerrada.ciegoCajaActivo).toBeUndefined();
    expect(cerrada.ventasEfectivo).toBe(1200);
    expect(cerrada.saldoCierre).toBe(900);
  });

  it('ADMIN: ninguna fila se recorta, ni siquiera las ABIERTA', async () => {
    const { svc } = makeCajaService({
      rol: UserRole.ADMIN,
      cajas: [cajaBase({ id: 1, estado: EstadoCierre.ABIERTA })],
    });
    const { data } = await svc.getHistorial(1, 20);

    expect(data[0].ciegoCajaActivo).toBeUndefined();
    expect(data[0].ventasEfectivo).toBe(1200);
  });

  it('sin rol resuelto (defensivo — nunca debería pasar, pero no debe fallar): no recorta nada', async () => {
    const { svc } = makeCajaService();
    const { data } = await svc.getHistorial(1, 20);
    expect(data[0].ciegoCajaActivo).toBeUndefined();
  });
});

describe('CajaService.getCajaHoyByUserId — Cierre Actual del propio VENDEDOR', () => {
  it('su caja ABIERTA: recortada SIEMPRE, aunque la empresa tenga cierreCajaCiego apagado', async () => {
    const { svc } = makeCajaService({ cierreCajaCiego: false });
    const r: any = await svc.getCajaHoyByUserId(1);

    expect(r.ciegoCajaActivo).toBe(true);
    expect(r.ventasEfectivo).toBeUndefined();
  });

  it('su caja ABIERTA, empresa CON cierreCajaCiego activo: sigue recortada (las dos reglas coinciden, no se pisan)', async () => {
    const { svc } = makeCajaService({ cierreCajaCiego: true });
    const r: any = await svc.getCajaHoyByUserId(1);

    expect(r.ciegoCajaActivo).toBe(true);
    expect(r.ventasEfectivo).toBeUndefined();
  });

  it('su caja ya CERRADA: datos completos para que pueda imprimir', async () => {
    const { svc } = makeCajaService({
      cajas: [cajaBase({ estado: EstadoCierre.CERRADA, saldoCierre: 1550 })],
    });
    const r: any = await svc.getCajaHoyByUserId(1);

    expect(r.ciegoCajaActivo).toBeUndefined();
    expect(r.ventasEfectivo).toBe(1200);
  });
});

// Requisito explícito (2026-10-11): ADMIN/CONTADOR deben ver el Desglose de
// Operaciones completo al cerrar la caja de un cajero, CON O SIN el cierre
// ciego de la empresa activo — ese toggle decide qué ve la CAJERA al
// declarar, nunca lo que ve quien revisa/autoriza. El controller ya solo
// enruta aquí fuera de VENDEDOR (CajaController.getCajaHoy), pero no había
// ningún test que lo confirmara — el hueco quedaba cubierto solo por el
// routing del controller, nunca verificado contra el servicio real.
describe('CajaService.getCajaHoy (por vendedorId) — ADMIN/CONTADOR nunca ven la caja recortada', () => {
  it('caja ABIERTA, empresa CON cierreCajaCiego activo: datos completos igual, ciegoCajaActivo nunca se marca', async () => {
    const { svc } = makeCajaService({ cierreCajaCiego: true });
    const r: any = await svc.getCajaHoy(10); // vendedorId de cajaBase()

    expect(r.ciegoCajaActivo).toBeUndefined();
    expect(r.ventasEfectivo).toBe(1200);
    expect(r.ventasTarjeta).toBe(300);
  });

  it('caja ABIERTA, empresa SIN cierreCajaCiego: mismo resultado, datos completos', async () => {
    const { svc } = makeCajaService({ cierreCajaCiego: false });
    const r: any = await svc.getCajaHoy(10);

    expect(r.ciegoCajaActivo).toBeUndefined();
    expect(r.ventasEfectivo).toBe(1200);
  });
});

// Incidente real (empresa 73, caja #788, 2026-10-12): Beatriz Riva intentó
// cerrar la caja de Franchesca Sosa 6 veces, siempre con el mismo 400,
// porque el formulario no avisaba de antemano que no era su caja. `esMiCaja`
// es lo que el frontend usa para mostrar "Estás cerrando la caja de
// [cajero]" y exigir el motivo ANTES de intentar cerrar, con la MISMA lógica
// que ya valida el cierre (esCajaDelUsuario) — nunca una copia aparte.
describe('CajaService.getCajaHoy — esMiCaja (para el aviso del frontend, no decide el permiso real)', () => {
  it('sin usuarioActual (ningún caller lo pasa): esMiCaja no se calcula — undefined, no rompe nada existente', async () => {
    const { svc } = makeCajaService();
    const r: any = await svc.getCajaHoy(10);

    expect(r.esMiCaja).toBeUndefined();
  });

  it('caja.userId === usuarioActual.id: esMiCaja true', async () => {
    const { svc } = makeCajaService({ cajas: [cajaBase({ userId: 114 })] });
    const r: any = await svc.getCajaHoy(10, { id: 114 });

    expect(r.esMiCaja).toBe(true);
  });

  it('caja.userId distinto y sin vendedorId propio resuelto (el caso real: Beatriz admin, caja de Franchesca): esMiCaja false', async () => {
    const { svc } = makeCajaService({ cajas: [cajaBase({ userId: 114 })] }); // dataSource.query → [] por defecto, resolverMiVendedorId no resuelve nada
    const r: any = await svc.getCajaHoy(10, { id: 113 });

    expect(r.esMiCaja).toBe(false);
  });
});

describe('CajaService.getDatosParaImprimir — datos COMPLETOS, para después de la autorización de supervisor', () => {
  it('devuelve la caja SIN recortar (el guard de la ruta ya autorizó, o el rol no es VENDEDOR) + el detalle de facturas', async () => {
    const { svc } = makeCajaService({
      rol: UserRole.VENDEDOR,
      facturas: [{ id: 1, folio: 'B0100000001', total: 1200, subtotal: 1017, iva: 183 }],
    });
    // usuario.id coincide con cajaBase().userId (1) — es SU propia caja.
    const r: any = await svc.getDatosParaImprimir(1, { id: 1 });

    expect(r.ciegoCajaActivo).toBeUndefined();
    expect(r.ventasEfectivo).toBe(1200);
    expect(r.efectivoEsperado).toEqual(expect.any(Number));
    expect(r.facturasDetalle.facturas).toHaveLength(1);
    expect(r.facturasDetalle.resumen.total).toBe(1200);
  });

  it('VENDEDOR pidiendo el detalle de la caja de OTRO cajero: ForbiddenException (la autorización de supervisor no reemplaza el control de dueño)', async () => {
    const { svc } = makeCajaService({
      rol: UserRole.VENDEDOR,
      cajas: [cajaBase({ userId: 999, vendedorId: 999 })], // ni userId ni vendedorId coinciden con quien pide
    });
    await expect(
      svc.getDatosParaImprimir(1, { id: 10 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('caja inexistente: NotFoundException', async () => {
    const { svc } = makeCajaService({ rol: UserRole.VENDEDOR });
    await expect(
      svc.getDatosParaImprimir(999, { id: 10 }),
    ).rejects.toThrow(NotFoundException);
  });
});

// Bug real (2026-10-10): el recierre de Beatriz Riva a nombre de Bellamar
// González perdió el cuadre por forma de pago del cierre ORIGINAL — se
// sobrescribió en silencio al recerrar solo con efectivo (ver el bug de
// Caja Diaria, ahora corregido). anularCierre() debe preservarlo la primera
// vez, igual que ya preserva esperadoOriginal/contadoOriginal/diferenciaOriginal.
describe('CajaService.anularCierre — preserva el cuadre por forma de pago del PRIMER cierre', () => {
  const CUADRE_ORIGINAL = [
    { forma: 'efectivo', esperado: 5608.06, declarado: 6438.00, diferencia: 829.94 },
    { forma: 'tarjeta',  esperado: 2605.00, declarado: 0,       diferencia: -2605.00 },
  ];

  it('primer recierre: copia cuadrePorFormaPago/facturasSinFormaPago/sospechasFormaPago a los campos Original', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({
      id: 1, estado: EstadoCierre.CERRADA,
      saldoCierre: 5608.06, saldoFisico: 6438.00, diferencia: 829.94, formulaVersion: 2,
      cuadrePorFormaPago: CUADRE_ORIGINAL as any,
      facturasSinFormaPago: [{ id: 1807, folio: 'FAC-1807', total: 295 }] as any,
      sospechasFormaPago: [] as any,
      esperadoOriginal: undefined,
    }));
    const service = buildService(d);

    await service.anularCierre(1, 'el cajero no realizo cierre', 113, 'Beatriz Riva');

    expect(d.repo.update).toHaveBeenCalled();
    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.cuadrePorFormaPagoOriginal).toEqual(CUADRE_ORIGINAL);
    expect(cambios.facturasSinFormaPagoOriginal).toEqual([{ id: 1807, folio: 'FAC-1807', total: 295 }]);
    expect(cambios.sospechasFormaPagoOriginal).toEqual([]);
  });

  it('un SEGUNDO recierre no pisa el original — esperadoOriginal ya estaba escrito', async () => {
    const d = buildDeps();
    const cuadreDelPrimerCierre = [{ forma: 'efectivo', esperado: 100, declarado: 100, diferencia: 0 }];
    d.repo.findOne.mockResolvedValue(cajaAbierta({
      id: 1, estado: EstadoCierre.CERRADA,
      esperadoOriginal: 5608.06, // ya hubo un recierre antes
      cuadrePorFormaPago: [{ forma: 'efectivo', esperado: 999, declarado: 999, diferencia: 0 }] as any, // el del cierre ACTUAL (segundo), no el primero
    }));
    const service = buildService(d);

    await service.anularCierre(1, 'motivo', 1, 'Admin');

    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.cuadrePorFormaPagoOriginal).toBeUndefined(); // no se vuelve a escribir
  });
});

// Requisito explícito (2026-10-10): para aprobar un cierre con descuadre,
// ADMIN/CONTADOR registra un motivo obligatorio y el cierre pasa a
// REVISADA — queda en auditoría (quién, cuándo, por qué).
describe('CajaService.aprobarDescuadre', () => {
  it('aprueba un cierre fuera de umbral: pasa a REVISADA con motivo, autor y fecha', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({
      id: 1, estado: EstadoCierre.CERRADA, fueraDeUmbral: true,
    }));
    const service = buildService(d);

    await service.aprobarDescuadre(1, 'Verificado con el cajero, el faltante es real', 9, 'Ana Admin');

    expect(d.repo.update).toHaveBeenCalled();
    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.estado).toBe(EstadoCierre.REVISADA);
    expect(cambios.motivoAprobacionDescuadre).toBe('Verificado con el cajero, el faltante es real');
    expect(cambios.aprobadoPorUsuarioId).toBe(9);
    expect(cambios.aprobadoPorNombre).toBe('Ana Admin');
    expect(cambios.aprobadoEn).toBeInstanceOf(Date);
  });

  it('rechaza aprobar un cierre que NO tiene descuadre pendiente', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, estado: EstadoCierre.CERRADA, fueraDeUmbral: false }));
    const service = buildService(d);

    await expect(service.aprobarDescuadre(1, 'motivo', 9, 'Ana')).rejects.toThrow(BadRequestException);
    expect(d.repo.update).not.toHaveBeenCalled();
  });

  it('rechaza aprobar un cierre ya REVISADA (no se puede aprobar dos veces)', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, estado: EstadoCierre.REVISADA, fueraDeUmbral: true }));
    const service = buildService(d);

    await expect(service.aprobarDescuadre(1, 'motivo', 9, 'Ana')).rejects.toThrow(BadRequestException);
    expect(d.repo.update).not.toHaveBeenCalled();
  });

  it('exige motivo — rechaza vacío o solo espacios', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(cajaAbierta({ id: 1, estado: EstadoCierre.CERRADA, fueraDeUmbral: true }));
    const service = buildService(d);

    await expect(service.aprobarDescuadre(1, '   ', 9, 'Ana')).rejects.toThrow(BadRequestException);
    expect(d.repo.update).not.toHaveBeenCalled();
  });

  it('caja inexistente → 404', async () => {
    const d = buildDeps();
    d.repo.findOne.mockResolvedValue(null);
    const service = buildService(d);

    await expect(service.aprobarDescuadre(999, 'motivo', 9, 'Ana')).rejects.toThrow(NotFoundException);
  });
});

// Requisito explícito (2026-10-10): política "Cierre de caja con descuadre"
// en Modo Supervisor — desactivada por defecto (no cambia el comportamiento
// actual). Si está activa y el cierre queda fuera de umbral, un supervisor
// (nunca la propia cajera) tiene que autorizar ANTES de guardar, ver la
// tabla por forma de pago y escribir un motivo obligatorio.
describe('CajaService.cerrarCaja — política "cierre_caja_descuadre" (supervisor antes de guardar)', () => {
  const CAJERO_ID = 42;
  const SUPERVISOR_ID = 9;

  /** SQL-aware mock de dataSource.query — política, token (peek/consumir) y nombre del supervisor. */
  function mockDescuadreSupervisor(d: ReturnType<typeof buildDeps>, opts: {
    politica?: { requerido: boolean; modo: string };
    tokenValido?: boolean;      // existe, no usado, no expirado, supervisorId <> cajeroId
    tokenAutoasignado?: boolean; // existe pero supervisorId === cajeroId
    supervisorNombre?: string;
    posSupervisorLogId?: number | null; // ver cerrarPosSupervisorLogPorConsumo
    activacionParaCierre?: { empresaId: number; cajeroId: number; supervisorId: number; supervisorNombre: string; sucursalId: number | null };
    yaCerrada?: boolean;
  } = {}) {
    d.dataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('supervisor_politicas')) {
        return Promise.resolve(opts.politica ? [opts.politica] : []);
      }
      if (sql.includes('UPDATE supervisor_autorizaciones')) {
        return Promise.resolve(opts.tokenValido
          ? [{ id: 1, supervisorId: SUPERVISOR_ID, posSupervisorLogId: opts.posSupervisorLogId ?? null }]
          : []);
      }
      if (sql.includes('SELECT id FROM supervisor_autorizaciones') && sql.includes('"supervisorId" <> $2')) {
        return Promise.resolve(opts.tokenValido ? [{ id: 1 }] : []);
      }
      if (sql.includes('SELECT id FROM supervisor_autorizaciones') && sql.includes('"supervisorId" = $2')) {
        return Promise.resolve(opts.tokenAutoasignado ? [{ id: 1 }] : []);
      }
      if (sql.includes('SELECT nombre FROM users')) {
        return Promise.resolve([{ nombre: opts.supervisorNombre ?? 'Ana Admin' }]);
      }
      // cerrarPosSupervisorLogPorConsumo — activación, ¿ya cerrada?, INSERT.
      if (sql.includes('FROM pos_supervisor_log') && sql.includes('"sessionId" IS NULL')) {
        return Promise.resolve(opts.activacionParaCierre ? [opts.activacionParaCierre] : []);
      }
      if (sql.includes('FROM pos_supervisor_log') && sql.includes('"sessionId" = $1')) {
        return Promise.resolve(opts.yaCerrada ? [{ id: 999 }] : []);
      }
      if (sql.includes('INSERT INTO pos_supervisor_log')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]); // perfil de vendedor, etc. — igual que el resto de la suite
    });
  }

  function cajaConVentas(overrides: Partial<CierreCaja> = {}) {
    return cajaAbierta({
      id: 1, userId: CAJERO_ID, vendedorId: CAJERO_ID, vendedorNombre: 'Maximo',
      ventasEfectivo: 500,
      ...overrides,
    });
  }

  it('política INACTIVA (default): fuera de umbral, pero NO pide supervisor — comportamiento actual sin cambios', async () => {
    const d = buildDeps();
    mockDescuadreSupervisor(d); // sin política → default requerido:false
    d.repo.findOne.mockResolvedValue(cajaConVentas());
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 250, undefined, undefined, undefined, { id: CAJERO_ID }),
    ).resolves.toBeDefined();

    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.estado).toBe(EstadoCierre.CERRADA);
    expect(cambios.fueraDeUmbral).toBe(true);
    expect(cambios.motivoAprobacionDescuadre).toBeUndefined();
  });

  it('política ACTIVA, DENTRO del umbral: no pide supervisor (la política solo aplica si hay descuadre)', async () => {
    const d = buildDeps();
    mockDescuadreSupervisor(d, { politica: { requerido: true, modo: 'cada_vez' } });
    d.repo.findOne.mockResolvedValue(cajaConVentas());
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 500, undefined, undefined, undefined, { id: CAJERO_ID }), // diferencia 0, dentro del umbral
    ).resolves.toBeDefined();

    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.estado).toBe(EstadoCierre.CERRADA);
    expect(cambios.fueraDeUmbral).toBe(false);
  });

  it('política ACTIVA, fuera de umbral, SIN token: pide autorización (403), no guarda nada', async () => {
    const d = buildDeps();
    mockDescuadreSupervisor(d, { politica: { requerido: true, modo: 'cada_vez' } });
    d.repo.findOne.mockResolvedValue(cajaConVentas());
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 250, undefined, undefined, undefined, { id: CAJERO_ID }),
    ).rejects.toThrow(ForbiddenException);
    expect(d.repo.update).not.toHaveBeenCalled();

    try {
      await service.cerrarCaja(1, 250, undefined, undefined, undefined, { id: CAJERO_ID });
      throw new Error('no debia llegar aqui');
    } catch (e: any) {
      const body = e.getResponse() as any;
      expect(body.supervisorClaveRequerida).toBe('cierre_caja_descuadre');
      expect(body.supervisorModo).toBe('cada_vez');
      // La cajera nunca ve el monto de la diferencia — el 403 es generico.
      expect(JSON.stringify(body)).not.toContain('829.94');
      expect(JSON.stringify(body)).not.toMatch(/\d{3}\.\d{2}/); // ningun monto con decimales
    }
  });

  it('política ACTIVA, fuera de umbral, CON token válido pero SIN motivo: 428 con la tabla por forma de pago, no guarda nada', async () => {
    const d = buildDeps();
    mockDescuadreSupervisor(d, { politica: { requerido: true, modo: 'cada_vez' }, tokenValido: true });
    d.repo.findOne.mockResolvedValue(cajaConVentas());
    const service = buildService(d);

    try {
      await service.cerrarCaja(1, 250, undefined, undefined, undefined, { id: CAJERO_ID }, undefined, undefined, 'tok-abc');
      throw new Error('debia lanzar HttpException 428');
    } catch (e: any) {
      expect(e).toBeInstanceOf(HttpException);
      expect(e.getStatus()).toBe(428);
      const body = e.getResponse() as any;
      expect(body.requiereMotivoDescuadre).toBe(true);
      expect(body.supervisorToken).toBe('tok-abc');
      expect(Array.isArray(body.cuadrePorFormaPago)).toBe(true);
      const efectivo = body.cuadrePorFormaPago.find((f: any) => f.forma === 'efectivo');
      expect(efectivo.diferencia).toBe(-250);
    }
    expect(d.repo.update).not.toHaveBeenCalled(); // el token NO se consume todavia
  });

  it('política ACTIVA, fuera de umbral, CON token válido Y motivo: guarda REVISADA con el motivo y quién autorizó', async () => {
    const d = buildDeps();
    mockDescuadreSupervisor(d, {
      politica: { requerido: true, modo: 'cada_vez' }, tokenValido: true, supervisorNombre: 'Ana Admin',
    });
    d.repo.findOne.mockResolvedValue(cajaConVentas());
    const service = buildService(d);

    await service.cerrarCaja(
      1, 250, undefined, undefined, undefined, { id: CAJERO_ID }, undefined, undefined,
      'tok-abc', 'Verificado con el cajero, el faltante es real',
    );

    const [, cambios] = d.repo.update.mock.calls[0];
    expect(cambios.estado).toBe(EstadoCierre.REVISADA);
    expect(cambios.fueraDeUmbral).toBe(true);
    expect(cambios.motivoAprobacionDescuadre).toBe('Verificado con el cajero, el faltante es real');
    expect(cambios.aprobadoPorUsuarioId).toBe(SUPERVISOR_ID);
    expect(cambios.aprobadoPorNombre).toBe('Ana Admin');
    expect(cambios.aprobadoEn).toBeInstanceOf(Date);
    // Se sigue notificando a ADMIN/CONTADOR aunque ya haya autorizacion previa.
    expect(d.notificacionesSvc.notificarDescuadreCierre).toHaveBeenCalledTimes(1);
  });

  // Caso real (2026-10-14, empresa VENTAS DIVERSAS ELIDO): una autorización
  // de un solo uso (modo 'cada_vez') consumida quedaba "Activa" para
  // siempre en el reporte de Modo Supervisor. Ver cerrar-pos-supervisor-log.util.ts.
  it('política ACTIVA, fuera de umbral, CON token válido vinculado a una sesión: cierra esa sesión al consumir el token', async () => {
    const d = buildDeps();
    mockDescuadreSupervisor(d, {
      politica: { requerido: true, modo: 'cada_vez' }, tokenValido: true, supervisorNombre: 'Ana Admin',
      posSupervisorLogId: 77,
      activacionParaCierre: { empresaId: 7, cajeroId: CAJERO_ID, supervisorId: SUPERVISOR_ID, supervisorNombre: 'Ana Admin', sucursalId: null },
    });
    d.repo.findOne.mockResolvedValue(cajaConVentas());
    const service = buildService(d);

    await service.cerrarCaja(
      1, 250, undefined, undefined, undefined, { id: CAJERO_ID }, undefined, undefined,
      'tok-abc', 'Verificado con el cajero, el faltante es real',
    );

    const sqlCierre = d.dataSource.query.mock.calls.find(([sql]: any[]) => sql.includes('INSERT INTO pos_supervisor_log'));
    expect(sqlCierre).toBeTruthy();
    expect(sqlCierre![0]).toContain('Autorización de un solo uso consumida');
    expect(sqlCierre![1]).toEqual([7, CAJERO_ID, SUPERVISOR_ID, 'Ana Admin', null, 77]);
  });

  it('quien autoriza NO puede ser la misma cajera — rechazado al ver la tabla (sin motivo todavía)', async () => {
    const d = buildDeps();
    mockDescuadreSupervisor(d, { politica: { requerido: true, modo: 'cada_vez' }, tokenAutoasignado: true });
    d.repo.findOne.mockResolvedValue(cajaConVentas());
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 250, undefined, undefined, undefined, { id: CAJERO_ID }, undefined, undefined, 'tok-self'),
    ).rejects.toThrow(ForbiddenException);
    expect(d.repo.update).not.toHaveBeenCalled();

    try {
      await service.cerrarCaja(1, 250, undefined, undefined, undefined, { id: CAJERO_ID }, undefined, undefined, 'tok-self');
      throw new Error('no debia llegar aqui');
    } catch (e: any) {
      expect(e.getResponse().message).toBe('Quien autoriza no puede ser la misma cajera.');
    }
  });

  it('quien autoriza NO puede ser la misma cajera — rechazado también al intentar consumir el token con motivo', async () => {
    const d = buildDeps();
    mockDescuadreSupervisor(d, { politica: { requerido: true, modo: 'cada_vez' }, tokenAutoasignado: true });
    d.repo.findOne.mockResolvedValue(cajaConVentas());
    const service = buildService(d);

    await expect(
      service.cerrarCaja(
        1, 250, undefined, undefined, undefined, { id: CAJERO_ID }, undefined, undefined,
        'tok-self', 'Yo mismo lo autorizo',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(d.repo.update).not.toHaveBeenCalled();
  });

  it('token inválido/expirado/ya usado: 403, no guarda nada', async () => {
    const d = buildDeps();
    mockDescuadreSupervisor(d, { politica: { requerido: true, modo: 'cada_vez' } }); // sin tokenValido ni tokenAutoasignado
    d.repo.findOne.mockResolvedValue(cajaConVentas());
    const service = buildService(d);

    await expect(
      service.cerrarCaja(1, 250, undefined, undefined, undefined, { id: CAJERO_ID }, undefined, undefined, 'tok-invalido'),
    ).rejects.toThrow(ForbiddenException);
    expect(d.repo.update).not.toHaveBeenCalled();
  });
});
