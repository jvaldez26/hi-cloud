import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Proyecto, EstadoProyecto, TipoFacturacion } from './entities/proyecto.entity';
import { Tarea, EstadoTarea, PrioridadTarea } from './entities/tarea.entity';
import { RegistroTiempo } from './entities/registro-tiempo.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';

interface CreateProyectoDto {
  nombre: string; descripcion?: string; clienteId?: number;
  fechaInicio: string; fechaFin?: string;
  estado?: EstadoProyecto; tipoFacturacion?: TipoFacturacion;
  presupuesto?: number; horasEstimadas?: number;
  tarifaHora?: number; responsableId?: number; notas?: string;
}

interface CreateTareaDto {
  proyectoId: number; titulo: string; descripcion?: string;
  estado?: EstadoTarea; prioridad?: PrioridadTarea;
  fechaVencimiento?: string; horasEstimadas?: number;
  asignadoId?: number; orden?: number;
}

interface CreateRegistroDto {
  proyectoId: number; tareaId?: number; fecha: string;
  horas: number; descripcion?: string; usuarioId: number;
}

@Injectable()
export class ProyectosService {
  constructor(
    @InjectRepository(Proyecto)       private proyRepo:  Repository<Proyecto>,
    @InjectRepository(Tarea)          private tareaRepo: Repository<Tarea>,
    @InjectRepository(RegistroTiempo) private tiempoRepo: Repository<RegistroTiempo>,
    private tenantService: TenantService,
  ) {}

  // ── Proyectos ────────────────────────────────────────────────────────────────

  async crear(dto: CreateProyectoDto): Promise<Proyecto> {
    return this.proyRepo.save(this.proyRepo.create({
      empresaId:   this.tenantService.getEmpresaId(),
      ...dto,
      fechaInicio: new Date(dto.fechaInicio),
      fechaFin:    dto.fechaFin ? new Date(dto.fechaFin) : undefined,
    }));
  }

  async listar(pagination: PaginationDto, estado?: EstadoProyecto, clienteId?: number) {
    const { limit = 10, page = 1, search } = pagination;
    const qb = this.proyRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.responsable', 'r')
      .where('p.isActive = :a AND p.empresaId = :eid', { a: true, eid: this.tenantService.getEmpresaId() });

    if (estado)   qb.andWhere('p.estado = :e',    { e: estado });
    if (clienteId)qb.andWhere('p.clienteId = :c', { c: clienteId });
    if (search)   qb.andWhere('p.nombre ILIKE :s', { s: `%${search}%` });

    const [data, total] = await qb
      .orderBy('p.fechaInicio', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    // Enriquecer con métricas
    const enriched = await Promise.all(data.map(p => this.enriquecerProyecto(p)));

    return { data: enriched, meta: { total, page, limit } };
  }

  private async enriquecerProyecto(p: Proyecto) {
    const [tareas, tiempos] = await Promise.all([
      this.tareaRepo.find({ where: { proyectoId: p.id, isActive: true } }),
      this.tiempoRepo
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.horas), 0)', 'total')
        .where('t.proyectoId = :pid', { pid: p.id })
        .getRawOne(),
    ]);

    const totalTareas     = tareas.length;
    const tareasCompletas = tareas.filter(t => t.estado === EstadoTarea.COMPLETADA).length;
    const avance          = totalTareas > 0 ? Math.round((tareasCompletas / totalTareas) * 100) : p.porcentajeAvance;
    const horasRegistradas= Number(tiempos?.total ?? 0);

    return {
      ...p,
      totalTareas,
      tareasCompletas,
      avance,
      horasRegistradas,
      costReal: p.tarifaHora ? horasRegistradas * Number(p.tarifaHora) : 0,
    };
  }

  async findById(id: number) {
    const p = await this.proyRepo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true }, relations: ['responsable'] });
    if (!p) throw new NotFoundException(`Proyecto #${id} no encontrado`);
    return this.enriquecerProyecto(p);
  }

  async actualizar(id: number, dto: Partial<CreateProyectoDto>): Promise<any> {
    await this.findById(id);
    await this.proyRepo.update(id, {
      ...dto,
      fechaInicio: dto.fechaInicio ? new Date(dto.fechaInicio) : undefined,
      fechaFin:    dto.fechaFin    ? new Date(dto.fechaFin)    : undefined,
    } as any);
    return this.findById(id);
  }

  async eliminar(id: number) {
    await this.findById(id);
    await this.proyRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Tareas ───────────────────────────────────────────────────────────────────

  async crearTarea(dto: CreateTareaDto): Promise<Tarea> {
    await this.findById(dto.proyectoId);
    const ultimoOrden = await this.tareaRepo.count({ where: { proyectoId: dto.proyectoId, isActive: true } });
    return this.tareaRepo.save(this.tareaRepo.create({
      ...dto,
      fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : undefined,
      orden: dto.orden ?? ultimoOrden,
    }));
  }

  async getTareas(proyectoId: number) {
    return this.tareaRepo.find({
      where: { proyectoId, isActive: true },
      relations: ['asignado'],
      order: { orden: 'ASC', createdAt: 'ASC' },
    });
  }

  async actualizarTarea(id: number, dto: Partial<CreateTareaDto>): Promise<Tarea> {
    const t = await this.tareaRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Tarea #${id} no encontrada`);
    await this.tareaRepo.update(id, {
      ...dto,
      fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : undefined,
    } as any);
    return this.tareaRepo.findOne({ where: { id }, relations: ['asignado'] }) as Promise<Tarea>;
  }

  async eliminarTarea(id: number) {
    await this.tareaRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Registro de tiempo ───────────────────────────────────────────────────────

  async registrarTiempo(dto: CreateRegistroDto): Promise<RegistroTiempo> {
    if (dto.horas <= 0 || dto.horas > 24)
      throw new BadRequestException('Las horas deben estar entre 0.5 y 24');
    return this.tiempoRepo.save(this.tiempoRepo.create({
      ...dto,
      fecha: new Date(dto.fecha),
    }));
  }

  async getTiempos(proyectoId: number, page = 1, limit = 20) {
    const [data, total] = await this.tiempoRepo.findAndCount({
      where: { proyectoId, isActive: true },
      relations: ['usuario'],
      order: { fecha: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { total, page, limit } };
  }

  async eliminarTiempo(id: number) {
    await this.tiempoRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────

  async getDashboard() {
    const [activos, completados, enPausa] = await Promise.all([
      this.proyRepo.count({ where: { isActive: true, estado: EstadoProyecto.ACTIVO } }),
      this.proyRepo.count({ where: { isActive: true, estado: EstadoProyecto.COMPLETADO } }),
      this.proyRepo.count({ where: { isActive: true, estado: EstadoProyecto.EN_PAUSA } }),
    ]);

    const horasMes = await this.tiempoRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.horas), 0)', 'total')
      .where('t.fecha >= :d', { d: new Date(new Date().getFullYear(), new Date().getMonth(), 1) })
      .getRawOne();

    const tareasPendientes = await this.tareaRepo.count({
      where: { isActive: true, estado: EstadoTarea.PENDIENTE },
    });

    const tareasVencidas = await this.tareaRepo
      .createQueryBuilder('t')
      .where('t.isActive = :a', { a: true })
      .andWhere('t.estado NOT IN (:...done)', { done: [EstadoTarea.COMPLETADA, EstadoTarea.CANCELADA] })
      .andWhere('t.fechaVencimiento < :hoy', { hoy: new Date() })
      .getCount();

    const recientes = await this.proyRepo.find({
      where: { isActive: true, estado: EstadoProyecto.ACTIVO },
      relations: ['responsable'],
      order: { updatedAt: 'DESC' },
      take: 5,
    });

    return {
      activos, completados, enPausa,
      horasMes: Number(horasMes?.total ?? 0),
      tareasPendientes, tareasVencidas,
      recientes: await Promise.all(recientes.map(p => this.enriquecerProyecto(p))),
    };
  }
}
