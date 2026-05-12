import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AccionAuditoria } from './entities/audit-log.entity';
import { FiltroAuditoriaDto } from './dto/filtro-auditoria.dto';

export interface CreateAuditLogDto {
  userId?:       number;
  userName?:     string;
  userRole?:     string;
  accion:        AccionAuditoria;
  modulo:        string;
  entidad?:      string;
  entidadId?:    string;
  descripcion:   string;
  valorAnterior?: string;
  valorNuevo?:    string;
  metodo:        string;
  ruta:          string;
  statusCode?:   number;
  duracionMs?:   number;
  exitoso:       boolean;
  ipAddress?:    string;
  userAgent?:    string;
}

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(
    @InjectRepository(AuditLog)
    private logRepository: Repository<AuditLog>,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Registro de eventos
  // ──────────────────────────────────────────────────────────────────

  async registrar(dto: CreateAuditLogDto): Promise<void> {
    try {
      await this.logRepository.save(this.logRepository.create(dto));
    } catch (err) {
      this.logger.error(`Error guardando audit log: ${(err as Error).message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Consultas
  // ──────────────────────────────────────────────────────────────────

  async getLogs(filtro: FiltroAuditoriaDto) {
    const { limit = 20, page = 1, accion, modulo, userId, fechaDesde, fechaHasta, exitoso } = filtro;

    const qb = this.logRepository
      .createQueryBuilder('l')
      .orderBy('l.createdAt', 'DESC');

    if (accion)     qb.andWhere('l.accion = :accion', { accion });
    if (modulo)     qb.andWhere('l.modulo ILIKE :mod', { mod: `%${modulo}%` });
    if (userId)     qb.andWhere('l.userId = :uid', { uid: userId });
    if (fechaDesde) qb.andWhere('l.createdAt >= :desde', { desde: new Date(fechaDesde) });
    if (fechaHasta) qb.andWhere('l.createdAt <= :hasta', { hasta: new Date(fechaHasta) });
    if (exitoso !== undefined) qb.andWhere('l.exitoso = :exitoso', { exitoso });

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getLogsByUser(userId: number, filtro: FiltroAuditoriaDto) {
    return this.getLogs({ ...filtro, userId });
  }

  async getLogsByModulo(modulo: string, filtro: FiltroAuditoriaDto) {
    return this.getLogs({ ...filtro, modulo });
  }

  async getResumen() {
    const hoy = new Date();
    const inicio24h  = new Date(hoy.getTime() - 24 * 60 * 60 * 1000);
    const inicioSem  = new Date(hoy.getTime() - 7  * 24 * 60 * 60 * 1000);
    const inicioMes  = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const [
      totalHoy, totalSemana, totalMes,
      erroresHoy, porAccion, porModulo, topUsuarios,
    ] = await Promise.all([
      // Eventos últimas 24h
      this.logRepository.count({ where: [] })
        .then(() =>
          this.logRepository
            .createQueryBuilder('l')
            .where('l.createdAt >= :desde', { desde: inicio24h })
            .getCount(),
        ),

      // Eventos última semana
      this.logRepository
        .createQueryBuilder('l')
        .where('l.createdAt >= :desde', { desde: inicioSem })
        .getCount(),

      // Eventos este mes
      this.logRepository
        .createQueryBuilder('l')
        .where('l.createdAt >= :desde', { desde: inicioMes })
        .getCount(),

      // Errores últimas 24h
      this.logRepository
        .createQueryBuilder('l')
        .where('l.createdAt >= :desde AND l.exitoso = false', { desde: inicio24h })
        .getCount(),

      // Distribución por acción (este mes)
      this.logRepository
        .createQueryBuilder('l')
        .select('l.accion', 'accion')
        .addSelect('COUNT(l.id)', 'cantidad')
        .where('l.createdAt >= :desde', { desde: inicioMes })
        .groupBy('l.accion')
        .orderBy('cantidad', 'DESC')
        .getRawMany<{ accion: string; cantidad: string }>(),

      // Distribución por módulo (este mes)
      this.logRepository
        .createQueryBuilder('l')
        .select('l.modulo', 'modulo')
        .addSelect('COUNT(l.id)', 'cantidad')
        .where('l.createdAt >= :desde', { desde: inicioMes })
        .groupBy('l.modulo')
        .orderBy('cantidad', 'DESC')
        .limit(10)
        .getRawMany<{ modulo: string; cantidad: string }>(),

      // Top 5 usuarios más activos (este mes)
      this.logRepository
        .createQueryBuilder('l')
        .select('l.userId', 'userId')
        .addSelect('l.userName', 'userName')
        .addSelect('COUNT(l.id)', 'acciones')
        .where('l.createdAt >= :desde AND l.userId IS NOT NULL', { desde: inicioMes })
        .groupBy('l.userId, l.userName')
        .orderBy('acciones', 'DESC')
        .limit(5)
        .getRawMany<{ userId: number; userName: string; acciones: string }>(),
    ]);

    return {
      eventos: {
        ultimas24h: totalHoy,
        ultimaSemana: totalSemana,
        esteMes: totalMes,
        erroresHoy,
      },
      distribucion: {
        porAccion:  porAccion.map(r => ({ accion: r.accion, cantidad: Number(r.cantidad) })),
        porModulo:  porModulo.map(r => ({ modulo: r.modulo, cantidad: Number(r.cantidad) })),
        topUsuarios: topUsuarios.map(r => ({
          userId:   r.userId,
          userName: r.userName,
          acciones: Number(r.acciones),
        })),
      },
      generadoEn: new Date().toISOString(),
    };
  }

  async getUltimosErrores(limite = 10) {
    return this.logRepository.find({
      where: { exitoso: false },
      order: { createdAt: 'DESC' },
      take: limite,
    });
  }
}
