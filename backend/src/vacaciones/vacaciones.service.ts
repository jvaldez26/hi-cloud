import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import {
  SolicitudVacacion, EstadoSolicitud,
} from './entities/solicitud-vacacion.entity';
import { Ausencia, TipoAusencia } from './entities/ausencia.entity';
import { Empleado } from '../nomina/entities/empleado.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';

interface CreateSolicitudDto {
  empleadoId:   number;
  fechaInicio:  string;
  fechaFin:     string;
  motivo?:      string;
}

interface CreateAusenciaDto {
  empleadoId:   number;
  fecha:        string;
  tipo:         TipoAusencia;
  justificada?: boolean;
  descripcion?: string;
  dias?:        number;
}

@Injectable()
export class VacacionesService {
  constructor(
    @InjectRepository(SolicitudVacacion)
    private solicitudRepo: Repository<SolicitudVacacion>,
    @InjectRepository(Ausencia)
    private ausenciaRepo:  Repository<Ausencia>,
    @InjectRepository(Empleado)
    private empleadoRepo:  Repository<Empleado>,
    private tenantService: TenantService,
  ) {}

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private diasHabiles(inicio: Date, fin: Date): number {
    let dias = 0;
    const cur = new Date(inicio);
    while (cur <= fin) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) dias++;
      cur.setDate(cur.getDate() + 1);
    }
    return dias;
  }

  private diasCorrespondientes(fechaIngreso: Date, anio: number): number {
    const hoy   = new Date(anio, 11, 31);
    const inicio = new Date(fechaIngreso);
    const meses  = (hoy.getFullYear() - inicio.getFullYear()) * 12
                 + hoy.getMonth() - inicio.getMonth();
    const anios  = Math.floor(meses / 12);
    // Ley 16-92: 14 días primeros 5 años, 18 días 6-9 años, 23+ años a partir del 10mo
    if (anios < 1)  return Math.floor((meses / 12) * 14);
    if (anios < 5)  return 14;
    if (anios < 10) return 18;
    return 23;
  }

  // ── Balance de vacaciones de un empleado ─────────────────────────────────────

  async getBalance(empleadoId: number, anio?: number) {
    const year = anio ?? new Date().getFullYear();
    const empleado = await this.empleadoRepo.findOne({ where: { id: empleadoId, empresaId: this.tenantService.getEmpresaId(), isActive: true } });
    if (!empleado) throw new NotFoundException(`Empleado #${empleadoId} no encontrado`);

    const correspondientes = this.diasCorrespondientes(
      new Date(empleado['fechaIngreso'] ?? empleado.createdAt),
      year,
    );

    const usados = await this.solicitudRepo
      .createQueryBuilder('s')
      .select('COALESCE(SUM(s.diasSolicitados), 0)', 'total')
      .where('s.empleadoId = :eid', { eid: empleadoId })
      .andWhere('s.estado = :e', { e: EstadoSolicitud.APROBADA })
      .andWhere('s.anio = :y', { y: year })
      .getRawOne();

    const usadosNum = Number(usados.total ?? 0);

    return {
      empleadoId,
      nombre:         `${empleado['nombre']} ${empleado['apellido'] ?? ''}`.trim(),
      anio:           year,
      correspondientes,
      usados:         usadosNum,
      disponibles:    Math.max(0, correspondientes - usadosNum),
    };
  }

  async getBalanceTodos(anio?: number) {
    const year      = anio ?? new Date().getFullYear();
    const empleados = await this.empleadoRepo.find({ where: { empresaId: this.tenantService.getEmpresaId(), isActive: true } });
    return Promise.all(empleados.map(e => this.getBalance(e.id, year)));
  }

  // ── Solicitudes ─────────────────────────────────────────────────────────────

  async crearSolicitud(dto: CreateSolicitudDto, userId: number): Promise<SolicitudVacacion> {
    const inicio  = new Date(dto.fechaInicio);
    const fin     = new Date(dto.fechaFin);
    if (fin < inicio) throw new BadRequestException('La fecha fin debe ser posterior al inicio');

    const dias = this.diasHabiles(inicio, fin);
    if (dias < 1)    throw new BadRequestException('El período no contiene días hábiles');

    const balance = await this.getBalance(dto.empleadoId);
    if (balance.disponibles < dias) {
      throw new BadRequestException(
        `Solo tienes ${balance.disponibles} días disponibles, solicitaste ${dias}`,
      );
    }

    // Verificar solapamiento
    const solapada = await this.solicitudRepo
      .createQueryBuilder('s')
      .where('s.empleadoId = :eid', { eid: dto.empleadoId })
      .andWhere('s.estado IN (:...estados)', { estados: [EstadoSolicitud.PENDIENTE, EstadoSolicitud.APROBADA] })
      .andWhere('s.fechaInicio <= :fin', { fin })
      .andWhere('s.fechaFin >= :inicio', { inicio })
      .getOne();

    if (solapada) throw new BadRequestException('Ya existe una solicitud en ese período');

    const empresaId = this.tenantService.getEmpresaId();
    return this.solicitudRepo.save(
      this.solicitudRepo.create({
        empresaId,
        empleadoId:      dto.empleadoId,
        fechaInicio:     inicio,
        fechaFin:        fin,
        diasSolicitados: dias,
        motivo:          dto.motivo,
        anio:            inicio.getFullYear(),
        aprobadorId:     userId,
      }),
    );
  }

  async listarSolicitudes(pagination: PaginationDto, estado?: EstadoSolicitud, empleadoId?: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1 } = pagination;
    const qb = this.solicitudRepo.createQueryBuilder('s')
      .leftJoinAndSelect('s.empleado', 'e')
      .where('s.empresaId = :eid', { eid: empresaId })
      .andWhere('s.isActive = :a', { a: true });

    if (estado)     qb.andWhere('s.estado = :e', { e: estado });
    if (empleadoId) qb.andWhere('s.empleadoId = :eid', { eid: empleadoId });

    const [data, total] = await qb
      .orderBy('s.fechaInicio', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit } };
  }

  async aprobar(id: number, userId: number, obs?: string): Promise<SolicitudVacacion> {
    const s = await this.solicitudRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`Solicitud #${id} no encontrada`);
    if (s.estado !== EstadoSolicitud.PENDIENTE)
      throw new BadRequestException('Solo se pueden aprobar solicitudes pendientes');

    await this.solicitudRepo.update(id, {
      estado:               EstadoSolicitud.APROBADA,
      aprobadorId:          userId,
      fechaRespuesta:       new Date(),
      observacionAprobador: obs,
    });
    return this.solicitudRepo.findOne({ where: { id }, relations: ['empleado'] }) as Promise<SolicitudVacacion>;
  }

  async rechazar(id: number, userId: number, obs?: string): Promise<SolicitudVacacion> {
    const s = await this.solicitudRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`Solicitud #${id} no encontrada`);
    if (s.estado !== EstadoSolicitud.PENDIENTE)
      throw new BadRequestException('Solo se pueden rechazar solicitudes pendientes');

    await this.solicitudRepo.update(id, {
      estado:               EstadoSolicitud.RECHAZADA,
      aprobadorId:          userId,
      fechaRespuesta:       new Date(),
      observacionAprobador: obs,
    });
    return this.solicitudRepo.findOne({ where: { id }, relations: ['empleado'] }) as Promise<SolicitudVacacion>;
  }

  // ── Ausencias ────────────────────────────────────────────────────────────────

  async registrarAusencia(dto: CreateAusenciaDto, userId: number): Promise<Ausencia> {
    return this.ausenciaRepo.save(
      this.ausenciaRepo.create({
        empleadoId:    dto.empleadoId,
        fecha:         new Date(dto.fecha),
        tipo:          dto.tipo,
        justificada:   dto.justificada ?? false,
        descripcion:   dto.descripcion,
        dias:          dto.dias ?? 1,
        registradoPor: userId,
      }),
    );
  }

  async listarAusencias(pagination: PaginationDto, empleadoId?: number, mes?: number, anio?: number) {
    const { limit = 10, page = 1 } = pagination;
    const qb = this.ausenciaRepo.createQueryBuilder('a')
      .leftJoinAndSelect('a.empleado', 'e')
      .where('a.isActive = :ac', { ac: true });

    if (empleadoId) qb.andWhere('a.empleadoId = :eid', { eid: empleadoId });
    if (mes && anio) {
      const desde = new Date(anio, mes - 1, 1);
      const hasta = new Date(anio, mes, 0);
      qb.andWhere('a.fecha BETWEEN :d AND :h', { d: desde, h: hasta });
    }

    const [data, total] = await qb
      .orderBy('a.fecha', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit } };
  }

  async eliminarAusencia(id: number) {
    const a = await this.ausenciaRepo.findOne({ where: { id } });
    if (!a) throw new NotFoundException(`Ausencia #${id} no encontrada`);
    await this.ausenciaRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Resumen gerencial ────────────────────────────────────────────────────────

  async getResumenMes(mes: number, anio: number) {
    const desde = new Date(anio, mes - 1, 1);
    const hasta = new Date(anio, mes, 0);

    const ausencias = await this.ausenciaRepo
      .createQueryBuilder('a')
      .select(['a.tipo', 'COUNT(*) AS cantidad', 'SUM(a.dias) AS dias'])
      .where('a.fecha BETWEEN :d AND :h', { d: desde, h: hasta })
      .andWhere('a.isActive = :ac', { ac: true })
      .groupBy('a.tipo')
      .getRawMany();

    const enVacaciones = await this.solicitudRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.empleado', 'e')
      .where('s.estado = :e', { e: EstadoSolicitud.APROBADA })
      .andWhere('s.fechaInicio <= :h', { h: hasta })
      .andWhere('s.fechaFin >= :d', { d: desde })
      .getMany();

    const pendientes = await this.solicitudRepo.count({
      where: { estado: EstadoSolicitud.PENDIENTE, isActive: true },
    });

    return {
      mes, anio,
      ausenciasPorTipo: ausencias,
      enVacaciones:     enVacaciones.length,
      solicitudesPendientes: pendientes,
      detalleVacaciones: enVacaciones.map(s => ({
        empleado:    `${s.empleado?.['nombre'] ?? ''} ${s.empleado?.['apellido'] ?? ''}`.trim(),
        fechaInicio: s.fechaInicio,
        fechaFin:    s.fechaFin,
        dias:        s.diasSolicitados,
      })),
    };
  }
}
