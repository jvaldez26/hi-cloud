import { PagosSuscripcionService } from './pagos-suscripcion.service';

/**
 * El cargo por excedente de e-CF: quién decide el monto y qué pasa si algo
 * falla a medias.
 */

const DATOS = {
  ciclo: { inicio: '2026-08-05', fin: '2026-09-05' },
  plan: 'plus' as any, planNombre: 'Plus',
  emitidos: 6_412, cupo: 6_000, excedente: 412,
  precioUnitario: 3, monto: 1_236,
};

function montar(opts: { selloFalla?: boolean; datosFallan?: string } = {}) {
  const guardados: any[] = [];
  const sellados:  any[] = [];
  let transaccionRevertida = false;

  const repoFalso = {
    create: (x: any) => x,
    save:   async (x: any) => { guardados.push(x); return { id: 900, ...x }; },
  };

  const manager: any = { getRepository: () => repoFalso };

  const ds: any = {
    transaction: async (cb: any) => {
      try { return await cb(manager); }
      catch (e) { transaccionRevertida = true; guardados.length = 0; throw e; }
    },
  };

  const cuotaEcf: any = {
    datosParaCargo: async () => {
      if (opts.datosFallan) throw new Error(opts.datosFallan);
      return DATOS;
    },
    sellarCargo: async (_m: any, empresaId: number, d: any, cargoId: number, admin: number) => {
      if (opts.selloFalla) throw new Error('Ese ciclo se cobró mientras tanto. No se duplica.');
      sellados.push({ empresaId, d, cargoId, admin });
    },
  };

  const svc = new PagosSuscripcionService(
    repoFalso as any, {} as any, ds, {} as any, {} as any, {} as any, cuotaEcf,
  );
  return { svc, guardados, sellados, revertida: () => transaccionRevertida };
}

describe('el monto lo pone el servidor', () => {
  it('el cargo se crea con el monto recontado, no con nada del body', async () => {
    const { svc, guardados } = montar();
    await svc.generarCargoExcedenteEcf(44, '2026-08-05', 1);

    expect(guardados).toHaveLength(1);
    expect(guardados[0].monto).toBe(1_236);      // 412 × RD$3
    expect(guardados[0].tipo).toBe('CARGO');
    expect(guardados[0].estado).toBe('CONFIRMADO');
  });

  it('la firma del endpoint no acepta un monto: solo empresa, ciclo y admin', () => {
    // Si algún día alguien le añade un `monto`, este test lo obliga a pensarlo.
    expect(PagosSuscripcionService.prototype.generarCargoExcedenteEcf).toHaveLength(3);
  });

  it('el concepto viene escrito, con el ciclo, las cifras y el precio', async () => {
    const { svc, guardados } = montar();
    await svc.generarCargoExcedenteEcf(44, '2026-08-05', 1);
    const c = guardados[0].concepto;

    expect(c).toContain('Excedente de e-CF');
    expect(c).toContain('6,412');    // emitidos
    expect(c).toContain('6,000');    // cupo
    expect(c).toContain('412');      // excedente
    expect(c).toContain('RD$3.00');  // precio unitario
    expect(c).toContain('Plus');
  });

  it('el ciclo del concepto termina en el último día que es SUYO', async () => {
    // `fin` es exclusivo: el 05/09 ya pertenece al ciclo siguiente. Sobre un
    // cargo, un día de más es una discusión con el cliente.
    const { svc, guardados } = montar();
    await svc.generarCargoExcedenteEcf(44, '2026-08-05', 1);
    expect(guardados[0].concepto).toContain('05/08/2026 al 04/09/2026');
  });

  it('deja rastro de quién lo generó', async () => {
    const { svc, guardados } = montar();
    await svc.generarCargoExcedenteEcf(44, '2026-08-05', 7);
    expect(guardados[0].registradoPor).toBe(7);
    expect(guardados[0].confirmadoPor).toBe(7);
  });
});

describe('cargo y sello van juntos o no van', () => {
  it('el sello recibe el mismo cargoId que se acaba de crear', async () => {
    const { svc, sellados } = montar();
    await svc.generarCargoExcedenteEcf(44, '2026-08-05', 1);
    expect(sellados).toHaveLength(1);
    expect(sellados[0].cargoId).toBe(900);
    expect(sellados[0].d.monto).toBe(1_236);
  });

  it('si el sello falla, la transacción se revierte y NO queda cargo', async () => {
    // Un cargo sin su recibo es un cobro que nadie sabe explicar.
    const { svc, guardados, revertida } = montar({ selloFalla: true });
    await expect(svc.generarCargoExcedenteEcf(44, '2026-08-05', 1))
      .rejects.toThrow(/No se duplica/i);
    expect(revertida()).toBe(true);
    expect(guardados).toHaveLength(0);
  });

  it('si el ciclo no se puede cobrar, no se abre siquiera la transacción', async () => {
    const { svc, guardados, revertida } = montar({ datosFallan: 'El ciclo sigue abierto' });
    await expect(svc.generarCargoExcedenteEcf(44, '2026-09-05', 1))
      .rejects.toThrow(/sigue abierto/i);
    expect(guardados).toHaveLength(0);
    expect(revertida()).toBe(false);   // ni se llegó a abrir
  });
});
