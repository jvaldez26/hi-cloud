import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThan, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { CwTurno } from '../entities/cw-turno.entity';
import { CwTurnoServicio } from '../entities/cw-turno-servicio.entity';
import { CwTurnoEvento } from '../entities/cw-turno-evento.entity';
import { CwTurnoLavador } from '../entities/cw-turno-lavador.entity';
import { EstadoTurnoCw } from '../entities/tipos';
import { CwConfigService } from './cw-config.service';
import { CwServiciosService } from './cw-servicios.service';
import { CwContadorService } from './cw-contador.service';
import { CwComisionesService } from './cw-comisiones.service';
import { CrearTurnoDto, CambiarEstadoTurnoDto, AsignarBahiaDto, EditarTurnoDto } from '../dto/turno.dto';
import { AsignarLavadoresDto } from '../dto/turno-lavadores.dto';
import { FiltrosHistorialTurnoDto } from '../dto/filtros-historial.dto';
import { transicionValida, COLUMNA_TIMESTAMP_POR_ESTADO } from '../transiciones-turno';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';
import { RealtimeService } from '../../realtime/realtime.service';
import { OrigenFacturaValidadoresRegistry } from '../../common/origen-factura/origen-factura-validadores.registry';

const ORIGEN_TIPO = 'car_wash_turno';

/** Mismo patrón que PortalController.activarPortal — la URL pública SIEMPRE
 *  sale de FRONTEND_URL, nunca de lo que mande el navegador (localhost no
 *  sirve para que un cliente la escanee desde su celular). */
function urlPublicaDe(token: string): string {
  const baseUrl = process.env['FRONTEND_URL'] ?? 'https://hicloudrd.com';
  return `${baseUrl}/t/${token}`;
}

@Injectable()
export class CwTurnosService implements OnModuleInit {
  constructor(
    @InjectRepository(CwTurno) private readonly turnoRepo: Repository<CwTurno>,
    @InjectRepository(CwTurnoServicio) private readonly turnoServicioRepo: Repository<CwTurnoServicio>,
    @InjectRepository(CwTurnoEvento) private readonly eventoRepo: Repository<CwTurnoEvento>,
    @InjectRepository(CwTurnoLavador) private readonly turnoLavadorRepo: Repository<CwTurnoLavador>,
    private readonly configService: CwConfigService,
    private readonly serviciosService: CwServiciosService,
    private readonly contadorService: CwContadorService,
    private readonly comisionesService: CwComisionesService,
    private readonly realtimeService: RealtimeService,
    private readonly origenValidadores: OrigenFacturaValidadoresRegistry,
    private readonly ds: DataSource,
  ) {}

  onModuleInit() {
    this.origenValidadores.registrar(ORIGEN_TIPO, async (turnoId, empresaId) => {
      const turno = await this.turnoRepo.findOne({ where: { id: turnoId, empresaId } });
      if (!turno) throw new NotFoundException(`Turno #${turnoId} no encontrado`);
      if (turno.estado === 'cancelado') {
        throw new ConflictException(`El turno ${turno.codigo} está cancelado — no se puede cobrar`);
      }
    });
  }

  async crear(empresaId: number, sucursalId: number, usuarioId: number, dto: CrearTurnoDto): Promise<CwTurno & { urlPublica: string }> {
    const config = await this.configService.obtener(empresaId, sucursalId);
    const fechaRD = fechaHoyRD();
    const numeroDia = await this.contadorService.siguienteNumero(empresaId, sucursalId, fechaRD);
    const codigo = `${config.prefijoTurno}-${String(numeroDia).padStart(3, '0')}`;
    const tokenPublico = randomBytes(32).toString('hex');
    const ahora = new Date();

    const serviciosCongelados = await Promise.all(
      dto.servicioIds.map(id => this.serviciosService.precioPara(empresaId, id, dto.tipoVehiculo)),
    );
    const servicios = await Promise.all(
      dto.servicioIds.map(async (id, i) => {
        const servicio = await this.serviciosService.obtener(empresaId, id);
        return { servicio, precio: serviciosCongelados[i] };
      }),
    );

    const turno = await this.turnoRepo.save(this.turnoRepo.create({
      empresaId, sucursalId, numeroDia, codigo, fechaRD,
      placa: dto.placa.toUpperCase().trim(),
      tipoVehiculo: dto.tipoVehiculo,
      marca: dto.marca, color: dto.color,
      clienteId: dto.clienteId, telefono: dto.telefono,
      estado: 'en_espera',
      tokenPublico,
      notasDanos: dto.notasDanos,
      enEsperaAt: ahora,
    }));

    await this.turnoServicioRepo.save(servicios.map(({ servicio, precio }) =>
      this.turnoServicioRepo.create({
        turnoId: turno.id,
        servicioId: servicio.id,
        nombre: servicio.nombre,
        precio: precio.precio,
        duracionMinutos: precio.duracionMinutos,
      }),
    ));

    await this.eventoRepo.save(this.eventoRepo.create({
      turnoId: turno.id, empresaId, estadoNuevo: 'en_espera', usuarioId,
    }));

    this.realtimeService.notify(empresaId, 'car_wash_turno', 'created', turno.id);
    return { ...turno, urlPublica: urlPublicaDe(turno.tokenPublico) };
  }

  /**
   * Para autollenar la recepción cuando la placa ya vino antes — cliente,
   * visitas y los datos del último turno (marca/color/tipo).
   *
   * Contrato de respuesta:
   * - Placa nunca vista (sin turnos) → null.
   * - Placa con al menos un turno → objeto completo, con `ultimoTurno`
   *   SIEMPRE presente (nunca undefined) y `servicios` siempre un array
   *   (vacío si el turno no llegó a tener servicios). `clienteNombre`/
   *   `telefono` pueden ser null.
   * - "Último turno" = el más reciente por createdAt SIN importar su estado
   *   (incluye cancelados): marca/color/tipoVehiculo siguen siendo datos
   *   reales del vehículo aunque ese turno en particular se cancelara, y son
   *   justo lo que esta función existe para autocompletar.
   *
   * Una sola consulta (en vez de COUNT + SELECT separados) evita la
   * condición de carrera que dejaba `ultimoTurno` undefined si el turno se
   * borraba entre ambas queries — causa real del bug de Sentry 7769544465.
   */
  async historialPorPlaca(empresaId: number, placa: string) {
    const placaNorm = placa.toUpperCase().trim();
    if (!placaNorm) return null;

    const turnos = await this.ds.query(
      `SELECT t.*, c.nombre AS "clienteNombre"
         FROM cw_turnos t
         LEFT JOIN clientes c ON c.id = t."clienteId"
        WHERE t."empresaId" = $1 AND t.placa = $2
        ORDER BY t."createdAt" DESC`,
      [empresaId, placaNorm],
    );
    if (turnos.length === 0) return null;

    const ultimo = turnos[0];
    const servicios = await this.turnoServicioRepo.find({ where: { turnoId: ultimo.id } });

    return {
      visitas: turnos.length,
      clienteId: ultimo.clienteId ?? null,
      clienteNombre: ultimo.clienteNombre ?? null,
      telefono: ultimo.telefono ?? null,
      ultimoTurno: {
        fechaRD: ultimo.fechaRD,
        marca: ultimo.marca ?? null,
        color: ultimo.color ?? null,
        tipoVehiculo: ultimo.tipoVehiculo ?? null,
        servicios: servicios.map(s => s.nombre),
      },
    };
  }

  /** Historial completo (todos los estados, incluido ENTREGADO/CANCELADO) con filtros — para la pantalla "Turnos". */
  async listarHistorial(empresaId: number, sucursalId: number, f: FiltrosHistorialTurnoDto) {
    const page = f.page && f.page > 0 ? f.page : 1;
    const limit = f.limit && f.limit > 0 ? f.limit : 20;
    const where: string[] = [`t."empresaId" = $1`, `t."sucursalId" = $2`];
    const params: any[] = [empresaId, sucursalId];

    const push = (clausula: string, valor: any) => { params.push(valor); where.push(clausula.replace('?', `$${params.length}`)); };
    if (f.desde) push(`t."fechaRD" >= ?`, f.desde);
    if (f.hasta) push(`t."fechaRD" <= ?`, f.hasta);
    if (f.estado) push(`t.estado = ?`, f.estado);
    if (f.placa) push(`t.placa ILIKE ?`, `%${f.placa}%`);
    if (f.tipoVehiculo) push(`t."tipoVehiculo" = ?`, f.tipoVehiculo);
    if (f.lavadorId) push(`EXISTS (SELECT 1 FROM cw_turno_lavadores tl WHERE tl."turnoId" = t.id AND tl."lavadorId" = ?)`, f.lavadorId);
    if (f.servicioId) push(`EXISTS (SELECT 1 FROM cw_turno_servicios ts WHERE ts."turnoId" = t.id AND ts."servicioId" = ?)`, f.servicioId);

    let cobradoJoin = '';
    if (f.cobrado !== undefined) {
      cobradoJoin = `LEFT JOIN facturas fc ON fc."empresaId" = t."empresaId" AND fc."origenTipo" = 'car_wash_turno' AND fc."origenId" = t.id AND fc.estado <> 'cancelada'`;
      where.push(f.cobrado === 'true' ? `fc.id IS NOT NULL` : `fc.id IS NULL`);
    }

    const whereSql = where.join(' AND ');
    const [{ total }] = await this.ds.query(
      `SELECT COUNT(DISTINCT t.id)::int AS total FROM cw_turnos t ${cobradoJoin} WHERE ${whereSql}`,
      params,
    );

    params.push(limit, (page - 1) * limit);
    const turnos = await this.ds.query(
      `SELECT DISTINCT t.* FROM cw_turnos t ${cobradoJoin}
        WHERE ${whereSql}
        ORDER BY t."createdAt" DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const conDetalle = await this.conDetalle(empresaId, turnos);
    return { data: conDetalle, total, page, limit };
  }

  async listarTablero(empresaId: number, sucursalId: number): Promise<Array<CwTurno & { servicios: CwTurnoServicio[]; facturaFolio: string | null }>> {
    const turnos = await this.turnoRepo.find({
      where: { empresaId, sucursalId },
      order: { createdAt: 'ASC' },
    });
    const activos = turnos.filter(t => t.estado !== 'entregado' && t.estado !== 'cancelado');
    return this.conDetalle(empresaId, activos);
  }

  async obtener(empresaId: number, id: number): Promise<CwTurno & { servicios: CwTurnoServicio[]; facturaFolio: string | null }> {
    const turno = await this.turnoRepo.findOne({ where: { id, empresaId } });
    if (!turno) throw new NotFoundException(`Turno #${id} no encontrado`);
    const [conDetalle] = await this.conDetalle(empresaId, [turno]);
    return conDetalle;
  }

  async cambiarEstado(
    empresaId: number,
    id: number,
    dto: CambiarEstadoTurnoDto,
    usuarioId: number,
    puedeForzar: boolean,
  ): Promise<CwTurno> {
    const turno = await this.turnoRepo.findOne({ where: { id, empresaId } });
    if (!turno) throw new NotFoundException(`Turno #${id} no encontrado`);

    const config = await this.configService.obtener(empresaId, turno.sucursalId);
    if (!transicionValida(turno.estado, dto.estado, config.usaSecado)) {
      throw new ConflictException(
        `No se puede pasar de "${turno.estado}" a "${dto.estado}"`,
      );
    }

    if (dto.estado === 'cancelado' && !dto.motivo) {
      throw new ConflictException('Cancelar un turno requiere un motivo');
    }

    let motivoEvento = dto.motivo;
    if (dto.estado === 'entregado' && config.cobroEn === 'entrega') {
      const cobrado = await this.tieneFacturaActiva(empresaId, id);
      if (!cobrado) {
        if (!dto.forzarSinCobro || !puedeForzar) {
          throw new ConflictException(
            'Este turno no tiene cobro registrado. Cóbralo o fuerza el paso sin cobro (solo ADMIN/SUPERVISOR).',
          );
        }
        motivoEvento = `${dto.motivo ? dto.motivo + ' — ' : ''}forzado a ENTREGADO sin cobro`;
      }
    }

    const estadoAnterior = turno.estado;
    const columnaTimestamp = COLUMNA_TIMESTAMP_POR_ESTADO[dto.estado];

    await this.ds.transaction(async em => {
      await em.update(CwTurno, { id, empresaId }, {
        estado: dto.estado,
        [columnaTimestamp]: new Date(),
        ...(dto.estado === 'cancelado' ? { motivoCancelacion: dto.motivo } : {}),
      } as any);
      await em.save(CwTurnoEvento, em.create(CwTurnoEvento, {
        turnoId: id, empresaId, estadoAnterior, estadoNuevo: dto.estado, usuarioId, motivo: motivoEvento,
      }));

      // Comisiones se generan al llegar a LISTO, en la MISMA transacción —
      // ver CwComisionesService.generarParaTurno (idempotente por ON CONFLICT).
      // Si el turno se cancela DESPUÉS de LISTO, estas líneas se mantienen a
      // propósito (solo un ADMIN las anula explícitamente, con motivo).
      if (dto.estado === 'listo') {
        const [turnoServicios, asignaciones] = await Promise.all([
          em.find(CwTurnoServicio, { where: { turnoId: id } }),
          em.find(CwTurnoLavador, { where: { turnoId: id } }),
        ]);
        await this.comisionesService.generarParaTurno(em, empresaId, turno, turnoServicios, asignaciones);
      }
    });

    this.realtimeService.notify(empresaId, 'car_wash_turno', 'updated', id);
    return this.turnoRepo.findOneBy({ id, empresaId }) as Promise<CwTurno>;
  }

  async asignarBahia(empresaId: number, id: number, dto: AsignarBahiaDto): Promise<CwTurno> {
    const turno = await this.turnoRepo.findOne({ where: { id, empresaId } });
    if (!turno) throw new NotFoundException(`Turno #${id} no encontrado`);
    if (dto.bahia !== undefined) turno.bahia = dto.bahia;
    if (dto.lavadorNombre !== undefined) turno.lavadorNombre = dto.lavadorNombre;
    const guardado = await this.turnoRepo.save(turno);
    this.realtimeService.notify(empresaId, 'car_wash_turno', 'updated', id);
    return guardado;
  }

  /** Datos descriptivos editables — placa/tipoVehiculo/servicios quedan
   *  fijos a propósito (ya hay precio congelado y, si aplica, comisiones). */
  async editar(empresaId: number, id: number, dto: EditarTurnoDto): Promise<CwTurno> {
    const turno = await this.turnoRepo.findOne({ where: { id, empresaId } });
    if (!turno) throw new NotFoundException(`Turno #${id} no encontrado`);
    if (dto.marca !== undefined) turno.marca = dto.marca;
    if (dto.color !== undefined) turno.color = dto.color;
    if (dto.telefono !== undefined) turno.telefono = dto.telefono;
    if (dto.notasDanos !== undefined) turno.notasDanos = dto.notasDanos;
    const guardado = await this.turnoRepo.save(turno);
    this.realtimeService.notify(empresaId, 'car_wash_turno', 'updated', id);
    return guardado;
  }

  /** Reemplaza la asignación de lavadores del turno — la suma de porcentajes
   *  debe dar 100. Se puede reasignar mientras el turno no haya llegado a
   *  LISTO (una vez generadas las comisiones, cambiar la asignación no las
   *  recalcula — evita reescribir dinero ya congelado). */
  async asignarLavadores(empresaId: number, id: number, dto: AsignarLavadoresDto): Promise<CwTurnoLavador[]> {
    const turno = await this.turnoRepo.findOne({ where: { id, empresaId } });
    if (!turno) throw new NotFoundException(`Turno #${id} no encontrado`);

    const suma = dto.lavadores.reduce((s, l) => s + Number(l.porcentaje), 0);
    if (Math.abs(suma - 100) > 0.01) {
      throw new ConflictException(`Los porcentajes de reparto deben sumar 100 (suman ${suma.toFixed(2)})`);
    }

    const yaGenerada = await this.comisionesService.porTurno(empresaId, id);
    if (yaGenerada.length > 0) {
      throw new ConflictException('Este turno ya generó comisiones (pasó por LISTO) — no se puede reasignar lavadores');
    }

    await this.ds.transaction(async em => {
      await em.delete(CwTurnoLavador, { turnoId: id });
      await em.save(CwTurnoLavador, dto.lavadores.map(l => em.create(CwTurnoLavador, {
        turnoId: id, lavadorId: l.lavadorId, porcentaje: l.porcentaje,
      })));
    });
    this.realtimeService.notify(empresaId, 'car_wash_turno', 'updated', id);
    return this.turnoLavadorRepo.find({ where: { turnoId: id } });
  }

  async estadoCobro(empresaId: number, id: number): Promise<{ cobrado: boolean; folio: string | null }> {
    const [row] = await this.ds.query(
      `SELECT folio FROM facturas
       WHERE "empresaId" = $1 AND "origenTipo" = $2 AND "origenId" = $3 AND estado <> 'cancelada'
       LIMIT 1`,
      [empresaId, ORIGEN_TIPO, id],
    );
    return { cobrado: !!row, folio: row?.folio ?? null };
  }

  /** Para que el POS cobre este turno: devuelve los detalles ya armados con
   *  el origen listo para pasarle a FacturasService.create(). */
  async detallesParaCobro(empresaId: number, id: number) {
    const servicios = await this.turnoServicioRepo.find({ where: { turnoId: id } });
    const turno = await this.obtener(empresaId, id);
    return {
      origenTipo: ORIGEN_TIPO,
      origenId: id,
      clienteId: turno.clienteId ?? undefined,
      detalles: servicios.map(s => ({ descripcion: `${s.nombre} (${turno.placa})`, cantidad: 1, precioUnitario: Number(s.precio) })),
    };
  }

  // ── Página pública ──────────────────────────────────────────────────────

  async obtenerPorTokenPublico(token: string): Promise<{
    negocioEmpresaId: number;
    codigo: string;
    estado: EstadoTurnoCw;
    lineaTiempo: Array<{ estado: EstadoTurnoCw; en: Date | null }>;
    servicios: string[];
    posicionEnCola: number;
    minutosEstimados: number;
    placaEnmascarada: string;
  } | null> {
    const turno = await this.turnoRepo.findOne({ where: { tokenPublico: token } });
    if (!turno) return null;

    const config = await this.configService.obtener(turno.empresaId, turno.sucursalId);
    if (turno.estado === 'entregado' && turno.entregadoAt) {
      const vencidoEn = new Date(turno.entregadoAt.getTime() + config.horasCaducidadEnlace * 3600_000);
      if (vencidoEn < new Date()) return null;
    }

    const { posicion, minutosEstimados } = await this.calcularCola(turno, config.bahiasActivas, config.usaSecado);
    const servicios = await this.turnoServicioRepo.find({ where: { turnoId: turno.id } });

    const etapas: EstadoTurnoCw[] = config.usaSecado
      ? ['en_espera', 'en_lavado', 'secado', 'listo', 'entregado']
      : ['en_espera', 'en_lavado', 'listo', 'entregado'];

    return {
      negocioEmpresaId: turno.empresaId,
      codigo: turno.codigo,
      estado: turno.estado,
      lineaTiempo: etapas.map(estado => ({ estado, en: (turno as any)[COLUMNA_TIMESTAMP_POR_ESTADO[estado]] ?? null })),
      servicios: servicios.map(s => s.nombre),
      posicionEnCola: posicion,
      minutosEstimados,
      placaEnmascarada: enmascararPlaca(turno.placa),
    };
  }

  private async calcularCola(turno: CwTurno, bahiasActivas: number, usaSecado: boolean): Promise<{ posicion: number; minutosEstimados: number }> {
    if (turno.estado !== 'en_espera') return { posicion: 0, minutosEstimados: 0 };

    const delante = await this.turnoRepo.find({
      where: { empresaId: turno.empresaId, sucursalId: turno.sucursalId, fechaRD: turno.fechaRD, estado: 'en_espera', createdAt: LessThan(turno.createdAt) },
    });
    const enProceso = await this.turnoRepo.find({
      where: { empresaId: turno.empresaId, sucursalId: turno.sucursalId, estado: In(usaSecado ? ['en_lavado', 'secado'] : ['en_lavado']) },
    });

    const duracionPorTurno = await this.duracionesPorTurno([...delante, ...enProceso].map(t => t.id));

    const minutosDelante = delante.reduce((s, t) => s + (duracionPorTurno.get(t.id) ?? 0), 0);
    const ahora = Date.now();
    const minutosEnProceso = enProceso.reduce((s, t) => {
      const duracionTotal = duracionPorTurno.get(t.id) ?? 0;
      const inicio = t.enLavadoAt?.getTime() ?? ahora;
      const transcurridos = Math.max(0, Math.floor((ahora - inicio) / 60_000));
      return s + Math.max(0, duracionTotal - transcurridos);
    }, 0);

    const minutosEstimados = Math.ceil((minutosDelante + minutosEnProceso) / Math.max(1, bahiasActivas));
    return { posicion: delante.length, minutosEstimados };
  }

  private async duracionesPorTurno(turnoIds: number[]): Promise<Map<number, number>> {
    if (!turnoIds.length) return new Map();
    const filas = await this.turnoServicioRepo.find({ where: { turnoId: In(turnoIds) } });
    const mapa = new Map<number, number>();
    for (const f of filas) mapa.set(f.turnoId, (mapa.get(f.turnoId) ?? 0) + f.duracionMinutos);
    return mapa;
  }

  private async tieneFacturaActiva(empresaId: number, turnoId: number): Promise<boolean> {
    return (await this.estadoCobro(empresaId, turnoId)).cobrado;
  }

  private async conDetalle(empresaId: number, turnos: CwTurno[]) {
    if (!turnos.length) return [];
    const servicios = await this.turnoServicioRepo.find({ where: { turnoId: In(turnos.map(t => t.id)) } });
    const folios = await this.ds.query(
      `SELECT "origenId", folio FROM facturas
       WHERE "empresaId" = $1 AND "origenTipo" = $2 AND "origenId" = ANY($3) AND estado <> 'cancelada'`,
      [empresaId, ORIGEN_TIPO, turnos.map(t => t.id)],
    );
    const folioPorTurno = new Map<number, string>(folios.map((f: any) => [f.origenId, f.folio]));
    const lavadoresAsignados = await this.ds.query(
      `SELECT tl."turnoId", tl."lavadorId", tl.porcentaje, l.nombre
         FROM cw_turno_lavadores tl
         JOIN cw_lavadores l ON l.id = tl."lavadorId"
        WHERE tl."turnoId" = ANY($1)`,
      [turnos.map(t => t.id)],
    );
    return turnos.map(t => ({
      ...t,
      servicios: servicios.filter(s => s.turnoId === t.id),
      facturaFolio: folioPorTurno.get(t.id) ?? null,
      lavadoresAsignados: lavadoresAsignados
        .filter((l: any) => l.turnoId === t.id)
        .map((l: any) => ({ lavadorId: l.lavadorId, nombre: l.nombre, porcentaje: Number(l.porcentaje) })),
      urlPublica: urlPublicaDe(t.tokenPublico),
    }));
  }
}

function enmascararPlaca(placa: string): string {
  if (placa.length <= 3) return placa;
  return `${placa.slice(0, 2)}${'•'.repeat(placa.length - 4)}${placa.slice(-2)}`;
}
