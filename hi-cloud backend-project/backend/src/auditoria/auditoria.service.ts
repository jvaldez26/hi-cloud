import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AccionAuditoria } from './entities/audit-log.entity';
import { FiltroAuditoriaDto } from './dto/filtro-auditoria.dto';

export interface CreateAuditLogDto {
  userId?:       number;
  userName?:     string;
  userRole?:     string;
  empresaId?:    number;
  accion:        AccionAuditoria;
  nivel?:        string;
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

  async getLogs(filtro: FiltroAuditoriaDto, empresaId?: number) {
    const { limit = 50, page = 1, accion, modulo, userId, fechaDesde, fechaHasta, exitoso, nivel, niveles } = filtro;
    const search = (filtro as any).search as string | undefined;

    const qb = this.logRepository
      .createQueryBuilder('l')
      .orderBy('l.createdAt', 'DESC');

    if (empresaId) qb.andWhere('(l.empresaId = :eid OR l.empresaId IS NULL)', { eid: empresaId });
    if (accion)     qb.andWhere('l.accion = :accion', { accion });
    if (modulo)     qb.andWhere('l.modulo ILIKE :mod', { mod: `%${modulo}%` });
    if (userId)     qb.andWhere('l.userId = :uid', { uid: userId });
    if (fechaDesde) qb.andWhere('l.createdAt >= :desde', { desde: new Date(fechaDesde) });
    if (fechaHasta) qb.andWhere('l.createdAt <= :hasta', { hasta: new Date(fechaHasta + 'T23:59:59') });
    if (exitoso !== undefined) qb.andWhere('l.exitoso = :exitoso', { exitoso });
    if (nivel)     qb.andWhere('l.nivel = :nivel', { nivel });
    if (niveles) {
      const lista = niveles.split(',').map(n => n.trim()).filter(Boolean);
      if (lista.length > 0) qb.andWhere('l.nivel IN (:...nivelesArr)', { nivelesArr: lista });
    }
    if (search?.trim()) {
      const s = `%${search.trim()}%`;
      qb.andWhere(
        '(l.descripcion ILIKE :s OR l."userName" ILIKE :s OR l.modulo ILIKE :s OR l.ruta ILIKE :s)',
        { s },
      );
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /** Lista de módulos únicos que tienen logs — para el selector del panel */
  async getModulosDistintos(empresaId?: number): Promise<string[]> {
    const qb = this.logRepository
      .createQueryBuilder('l')
      .select('DISTINCT l.modulo', 'modulo')
      .orderBy('l.modulo', 'ASC');

    if (empresaId) qb.andWhere('(l.empresaId = :eid OR l.empresaId IS NULL)', { eid: empresaId });

    const rows = await qb.getRawMany<{ modulo: string }>();
    return rows.map(r => r.modulo).filter(Boolean);
  }

  async getLogsByUser(userId: number, filtro: FiltroAuditoriaDto, empresaId?: number) {
    return this.getLogs({ ...filtro, userId }, empresaId);
  }

  async getLogsByModulo(modulo: string, filtro: FiltroAuditoriaDto, empresaId?: number) {
    return this.getLogs({ ...filtro, modulo }, empresaId);
  }

  async getResumen(empresaId?: number) {
    const hoy = new Date();
    const inicio24h  = new Date(hoy.getTime() - 24 * 60 * 60 * 1000);
    const inicioSem  = new Date(hoy.getTime() - 7  * 24 * 60 * 60 * 1000);
    const inicioMes  = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    // Helper para aplicar el filtro de empresa a cualquier query builder
    const withEmpresa = (qb: ReturnType<typeof this.logRepository.createQueryBuilder>) => {
      if (empresaId) qb.andWhere('(l.empresaId = :eid OR l.empresaId IS NULL)', { eid: empresaId });
      return qb;
    };

    const [
      totalHoy, totalSemana, totalMes,
      erroresHoy, porAccion, porModulo, topUsuarios,
    ] = await Promise.all([
      // Eventos últimas 24h — filtrado por empresa
      withEmpresa(
        this.logRepository
          .createQueryBuilder('l')
          .where('l.createdAt >= :desde', { desde: inicio24h }),
      ).getCount(),

      // Eventos última semana — filtrado por empresa
      withEmpresa(
        this.logRepository
          .createQueryBuilder('l')
          .where('l.createdAt >= :desde', { desde: inicioSem }),
      ).getCount(),

      // Eventos este mes — filtrado por empresa
      withEmpresa(
        this.logRepository
          .createQueryBuilder('l')
          .where('l.createdAt >= :desde', { desde: inicioMes }),
      ).getCount(),

      // Errores últimas 24h — filtrado por empresa
      withEmpresa(
        this.logRepository
          .createQueryBuilder('l')
          .where('l.createdAt >= :desde AND l.exitoso = false', { desde: inicio24h }),
      ).getCount(),

      // Distribución por acción (este mes) — filtrado por empresa
      withEmpresa(
        this.logRepository
          .createQueryBuilder('l')
          .select('l.accion', 'accion')
          .addSelect('COUNT(l.id)', 'cantidad')
          .where('l.createdAt >= :desde', { desde: inicioMes }),
      ).groupBy('l.accion')
        .orderBy('cantidad', 'DESC')
        .getRawMany<{ accion: string; cantidad: string }>(),

      // Distribución por módulo (este mes) — filtrado por empresa
      withEmpresa(
        this.logRepository
          .createQueryBuilder('l')
          .select('l.modulo', 'modulo')
          .addSelect('COUNT(l.id)', 'cantidad')
          .where('l.createdAt >= :desde', { desde: inicioMes }),
      ).groupBy('l.modulo')
        .orderBy('cantidad', 'DESC')
        .limit(10)
        .getRawMany<{ modulo: string; cantidad: string }>(),

      // Top 5 usuarios más activos (este mes) — filtrado por empresa
      withEmpresa(
        this.logRepository
          .createQueryBuilder('l')
          .select('l.userId', 'userId')
          .addSelect('l.userName', 'userName')
          .addSelect('COUNT(l.id)', 'acciones')
          .where('l.createdAt >= :desde AND l.userId IS NOT NULL', { desde: inicioMes }),
      ).groupBy('l.userId, l.userName')
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

  async getUltimosErrores(limite = 10, empresaId?: number) {
    const qb = this.logRepository
      .createQueryBuilder('l')
      .where('l.exitoso = false')
      .orderBy('l.createdAt', 'DESC')
      .take(limite);

    if (empresaId) {
      qb.andWhere('(l.empresaId = :eid OR l.empresaId IS NULL)', { eid: empresaId });
    }

    return qb.getMany();
  }
}
