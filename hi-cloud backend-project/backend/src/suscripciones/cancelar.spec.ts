import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SuscripcionesService } from './suscripciones.service';
import { SuscripcionEstado } from './entities/suscripcion.entity';
import { AccionAuditoria } from './entities/suscripcion-auditoria.entity';

/**
 * Cancelar una suscripción detiene el devengo del cargo automático de
 * renovación — es el único tope para que una suspendida no acumule cargos
 * para siempre. Por eso: motivo obligatorio, autor SIEMPRE del parámetro que
 * pasa el controller (nunca algo que el propio método pudiera inventar), y
 * rastro en `suscripcion_auditoria` — mismo criterio que un cierre de caja
 * anulado.
 *
 * Mismo patrón liviano que fecha-emision.guard.spec.ts: instancia sin DI
 * real, con lo mínimo mockeado.
 */
function montar(opts: { estadoActual?: SuscripcionEstado } = {}) {
  const guardado: any[] = [];
  const auditoria: any[] = [];

  const svc: any = Object.create(SuscripcionesService.prototype);
  svc.logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn(), debug: jest.fn() };
  svc.repo = {
    findOne: jest.fn().mockResolvedValue({
      id: 42, empresaId: 59, estado: opts.estadoActual ?? SuscripcionEstado.SUSPENDIDA,
    }),
    update: jest.fn((_id: number, campos: any) => { guardado.push(campos); return Promise.resolve({ affected: 1 }); }),
  };
  svc.auditoriaRepo = {
    create: (x: any) => x,
    save:   jest.fn((x: any) => { auditoria.push(x); return Promise.resolve(x); }),
  };
  svc.getSuscripcion = jest.fn().mockResolvedValue({ id: 42, empresaId: 59, estado: SuscripcionEstado.CANCELADA });

  return { svc, guardado, auditoria };
}

describe('SuscripcionesService.cancelar', () => {
  it('exige motivo — sin él, no se toca nada', async () => {
    const { svc, guardado } = montar();
    await expect(svc.cancelar(59, '', 7)).rejects.toThrow(BadRequestException);
    await expect(svc.cancelar(59, '   ', 7)).rejects.toThrow(BadRequestException);
    expect(guardado).toHaveLength(0);
    expect(svc.repo.findOne).not.toHaveBeenCalled();
  });

  it('no se puede cancelar una suscripción que no existe', async () => {
    const { svc } = montar();
    svc.repo.findOne.mockResolvedValueOnce(null);
    await expect(svc.cancelar(999, 'cliente pidió baja', 7)).rejects.toThrow(NotFoundException);
  });

  it('no se puede cancelar dos veces', async () => {
    const { svc } = montar({ estadoActual: SuscripcionEstado.CANCELADA });
    await expect(svc.cancelar(59, 'otro motivo', 7)).rejects.toThrow(BadRequestException);
  });

  it('guarda estado, motivo, fecha y autor — el autor es el PARÁMETRO, no algo inventado', async () => {
    const { svc, guardado } = montar();
    await svc.cancelar(59, 'Cliente cerró operaciones, pidió baja por correo', 88);

    expect(guardado).toHaveLength(1);
    expect(guardado[0]).toMatchObject({
      estado:            SuscripcionEstado.CANCELADA,
      motivoCancelacion: 'Cliente cerró operaciones, pidió baja por correo',
      canceladaPor:      88,
    });
    expect(guardado[0].canceladaEn).toBeInstanceOf(Date);
  });

  it('recorta espacios del motivo antes de guardarlo', async () => {
    const { svc, guardado } = montar();
    await svc.cancelar(59, '   con espacios alrededor   ', 88);
    expect(guardado[0].motivoCancelacion).toBe('con espacios alrededor');
  });

  it('deja rastro en suscripcion_auditoria con el estado anterior y el nuevo', async () => {
    const { svc, auditoria } = montar({ estadoActual: SuscripcionEstado.SUSPENDIDA });
    await svc.cancelar(59, 'no pagó en 6 meses', 88);

    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]).toMatchObject({
      empresaId:     59,
      accion:        AccionAuditoria.CANCELACION,
      superAdminId:  88,
      motivo:        'no pagó en 6 meses',
      valorAnterior: { estado: SuscripcionEstado.SUSPENDIDA },
      valorNuevo:    { estado: SuscripcionEstado.CANCELADA },
    });
  });

  it('un fallo al guardar la auditoría no rompe la cancelación en sí', async () => {
    const { svc, guardado } = montar();
    svc.auditoriaRepo.save.mockRejectedValueOnce(new Error('conexión caída'));
    await expect(svc.cancelar(59, 'motivo válido', 88)).resolves.toBeDefined();
    expect(guardado).toHaveLength(1); // el estado sí se cambió
  });
});
