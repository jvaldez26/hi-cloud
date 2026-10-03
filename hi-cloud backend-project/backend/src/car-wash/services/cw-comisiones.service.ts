import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { CwComision } from '../entities/cw-comision.entity';
import { CwLavador } from '../entities/cw-lavador.entity';
import { CwServicioPrecio } from '../entities/cw-servicio-precio.entity';
import { CwTurno } from '../entities/cw-turno.entity';
import { CwTurnoServicio } from '../entities/cw-turno-servicio.entity';
import { CwTurnoLavador } from '../entities/cw-turno-lavador.entity';

const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class CwComisionesService {
  constructor(
    @InjectRepository(CwComision) private readonly repo: Repository<CwComision>,
  ) {}

  /**
   * Genera las comisiones del turno al pasar a LISTO — DEBE llamarse dentro
   * de la MISMA transacción que hace ese cambio de estado (recibe `em`, no
   * usa this.repo). Idempotente vía ON CONFLICT: si el turno vuelve a pasar
   * por LISTO (o esta llamada se reintenta), no duplica ninguna línea — el
   * índice único trata servicioId NULL como un valor fijo (COALESCE(...,0)),
   * así que las líneas de 'por_vehiculo'/'porcentaje' (servicioId NULL)
   * también quedan protegidas, no solo las de 'por_servicio'.
   *
   * Reglas de cálculo (ver migración 1769500000000 para el razonamiento):
   *  - 'por_vehiculo': UNA línea por lavador y turno — base = tarifa fija
   *    del lavador, independiente de los servicios que traiga el vehículo.
   *  - 'porcentaje': UNA línea por lavador y turno — base = subtotal de
   *    TODOS los servicios del turno, tarifa = % del lavador.
   *  - 'por_servicio': UNA línea por lavador y CADA servicio — tarifa =
   *    cw_servicio_precios.tarifaLavador (para el tipoVehiculo del turno) si
   *    existe, si no la tarifa genérica del lavador.
   * En los tres casos el monto final se multiplica por el % de reparto de
   * ESE lavador en el turno (cw_turno_lavadores.porcentaje).
   */
  async generarParaTurno(
    em: EntityManager,
    empresaId: number,
    turno: CwTurno,
    turnoServicios: CwTurnoServicio[],
    asignaciones: CwTurnoLavador[],
  ): Promise<void> {
    if (!asignaciones.length) return;

    const subtotalTurno = r2(turnoServicios.reduce((s, t) => s + Number(t.precio), 0));
    const lavadorIds = asignaciones.map(a => a.lavadorId);
    const lavadores = await em.find(CwLavador, { where: { id: In(lavadorIds), empresaId } });
    const lavadorPorId = new Map(lavadores.map(l => [l.id, l]));

    const servicioIds = [...new Set(turnoServicios.map(t => t.servicioId))];
    const precios = servicioIds.length
      ? await em.find(CwServicioPrecio, { where: { servicioId: In(servicioIds), tipoVehiculo: turno.tipoVehiculo } })
      : [];
    const tarifaOverridePorServicio = new Map(precios.map(p => [p.servicioId, p.tarifaLavador]));

    for (const asignacion of asignaciones) {
      const lavador = lavadorPorId.get(asignacion.lavadorId);
      // Lavador borrado/inactivado entre la asignación y el cambio a LISTO —
      // no debe tumbar el cambio de estado del turno.
      if (!lavador) continue;
      const porcentaje = Number(asignacion.porcentaje);

      if (lavador.modoPago === 'por_vehiculo') {
        const base = Number(lavador.valorModoPago);
        await this.insertarLinea(em, {
          empresaId, turnoId: turno.id, lavadorId: lavador.id, servicioId: null, servicioNombre: null,
          modoPago: lavador.modoPago, base, tarifaAplicada: base,
          porcentajeReparto: porcentaje, monto: r2(base * porcentaje / 100), fecha: turno.fechaRD,
        });
      } else if (lavador.modoPago === 'porcentaje') {
        const tarifaAplicada = Number(lavador.valorModoPago);
        await this.insertarLinea(em, {
          empresaId, turnoId: turno.id, lavadorId: lavador.id, servicioId: null, servicioNombre: null,
          modoPago: lavador.modoPago, base: subtotalTurno, tarifaAplicada,
          porcentajeReparto: porcentaje, monto: r2(subtotalTurno * tarifaAplicada / 100 * porcentaje / 100), fecha: turno.fechaRD,
        });
      } else {
        for (const ts of turnoServicios) {
          const tarifaAplicada = Number(tarifaOverridePorServicio.get(ts.servicioId) ?? lavador.valorModoPago);
          await this.insertarLinea(em, {
            empresaId, turnoId: turno.id, lavadorId: lavador.id, servicioId: ts.servicioId, servicioNombre: ts.nombre,
            modoPago: lavador.modoPago, base: Number(ts.precio), tarifaAplicada,
            porcentajeReparto: porcentaje, monto: r2(tarifaAplicada * porcentaje / 100), fecha: turno.fechaRD,
          });
        }
      }
    }
  }

  private async insertarLinea(em: EntityManager, l: {
    empresaId: number; turnoId: number; lavadorId: number; servicioId: number | null; servicioNombre: string | null;
    modoPago: string; base: number; tarifaAplicada: number; porcentajeReparto: number; monto: number; fecha: string;
  }): Promise<void> {
    await em.query(
      `INSERT INTO cw_comisiones
         ("empresaId", "turnoId", "lavadorId", "servicioId", "servicioNombre", "modoPago", base, "tarifaAplicada", "porcentajeReparto", monto, fecha, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'activa')
       ON CONFLICT ("turnoId", "lavadorId", COALESCE("servicioId", 0)) DO NOTHING`,
      [l.empresaId, l.turnoId, l.lavadorId, l.servicioId, l.servicioNombre, l.modoPago, l.base, l.tarifaAplicada, l.porcentajeReparto, l.monto, l.fecha],
    );
  }

  async porTurno(empresaId: number, turnoId: number): Promise<CwComision[]> {
    return this.repo.find({ where: { empresaId, turnoId }, order: { id: 'ASC' } });
  }

  async anular(empresaId: number, comisionId: number, motivo: string, usuarioId: number): Promise<CwComision> {
    const comision = await this.repo.findOne({ where: { id: comisionId, empresaId } });
    if (!comision) throw new NotFoundException(`Comisión #${comisionId} no encontrada`);
    if (comision.estado === 'anulada') throw new ConflictException('Esta comisión ya está anulada');
    if (comision.liquidacionId) {
      throw new ConflictException('No se puede anular una comisión ya incluida en una liquidación pagada');
    }
    comision.estado = 'anulada';
    comision.motivoAnulacion = motivo;
    comision.anuladoPorId = usuarioId;
    comision.anuladoAt = new Date();
    return this.repo.save(comision);
  }
}
