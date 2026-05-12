import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Proyecto, EstadoProyecto, TipoFacturacion } from './entities/proyecto.entity';
import { Tarea, EstadoTarea, PrioridadTarea } from './entities/tarea.entity';
import { RegistroTiempo } from './entities/registro-tiempo.entity';
import { PresupuestoProyectoLinea, CategoriaPresupuesto } from './entities/presupuesto-proyecto-linea.entity';
import { HitoProyecto } from './entities/hito-proyecto.entity';
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
  fechaInicio?: string; fechaVencimiento?: string;
  horasEstimadas?: number; horasReales?: number;
  asignadoId?: number; orden?: number; esHito?: boolean;
}

interface CreateRegistroDto {
  proyectoId: number; tareaId?: number; fecha: string;
  horas: number; descripcion?: string; usuarioId: number;
}

@Injectable()
export class ProyectosService {
  constructor(
    @InjectRepository(Proyecto)                 private proyRepo:        Repository<Proyecto>,
    @InjectRepository(Tarea)                    private tareaRepo:       Repository<Tarea>,
    @InjectRepository(RegistroTiempo)           private tiempoRepo:      Repository<RegistroTiempo>,
    @InjectRepository(PresupuestoProyectoLinea) private presupuestoRepo: Repository<PresupuestoProyectoLinea>,
    @InjectRepository(HitoProyecto)             private hitoRepo:        Repository<HitoProyecto>,
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
      fechaInicio:      dto.fechaInicio      ? new Date(dto.fechaInicio)      : undefined,
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
      fechaInicio:      dto.fechaInicio      ? new Date(dto.fechaInicio)      : undefined,
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

  // ── Presupuesto por Proyecto ─────────────────────────────────────────────────

  async getPresupuesto(proyectoId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.findById(proyectoId);

    const lineas = await this.presupuestoRepo.find({
      where: { proyectoId, empresaId, isActive: true },
      order: { categoria: 'ASC', createdAt: 'ASC' },
    });

    const totalPresupuestado = lineas.reduce((s, l) => s + Number(l.monto), 0);
    const totalReal          = lineas.reduce((s, l) => s + Number(l.montoReal), 0);

    const porCategoria = Object.values(CategoriaPresupuesto).map(cat => ({
      categoria: cat,
      presupuestado: lineas.filter(l => l.categoria === cat).reduce((s, l) => s + Number(l.monto), 0),
      real:          lineas.filter(l => l.categoria === cat).reduce((s, l) => s + Number(l.montoReal), 0),
    }));

    return {
      lineas,
      totalPresupuestado: Number(totalPresupuestado.toFixed(2)),
      totalReal:          Number(totalReal.toFixed(2)),
      variacion:          Number((totalPresupuestado - totalReal).toFixed(2)),
      porcentajeEjecucion: totalPresupuestado > 0 ? Number(((totalReal / totalPresupuestado) * 100).toFixed(1)) : 0,
      porCategoria,
    };
  }

  async addPresupuestoLinea(proyectoId: number, dto: {
    categoria: CategoriaPresupuesto;
    descripcion: string;
    monto: number;
    montoReal?: number;
    notas?: string;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.findById(proyectoId);
    const linea = this.presupuestoRepo.create({ ...dto, proyectoId, empresaId, montoReal: dto.montoReal ?? 0 });
    return this.presupuestoRepo.save(linea);
  }

  async updatePresupuestoLinea(id: number, dto: Partial<{ monto: number; montoReal: number; descripcion: string; notas: string }>) {
    const empresaId = this.tenantService.getEmpresaId();
    const linea = await this.presupuestoRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!linea) throw new NotFoundException(`Línea de presupuesto #${id} no encontrada`);
    await this.presupuestoRepo.update(id, dto as any);
    return this.presupuestoRepo.findOne({ where: { id } });
  }

  async deletePresupuestoLinea(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.presupuestoRepo.update({ id, empresaId }, { isActive: false });
    return { ok: true };
  }

  // ── Hitos ────────────────────────────────────────────────────────────────────

  async getHitos(proyectoId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    return this.hitoRepo.find({
      where: { proyectoId, empresaId, isActive: true },
      order: { fecha: 'ASC' },
    });
  }

  async createHito(proyectoId: number, dto: { nombre: string; fecha: string; descripcion?: string }) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.findById(proyectoId);
    const hito = this.hitoRepo.create({ ...dto, proyectoId, empresaId, fecha: new Date(dto.fecha), completado: false });
    return this.hitoRepo.save(hito);
  }

  async updateHito(id: number, dto: { completado?: boolean; nombre?: string; fecha?: string; descripcion?: string }) {
    const empresaId = this.tenantService.getEmpresaId();
    const hito = await this.hitoRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!hito) throw new NotFoundException(`Hito #${id} no encontrado`);
    await this.hitoRepo.update(id, {
      ...dto,
      fecha:           dto.fecha ? new Date(dto.fecha) : undefined,
      fechaCompletado: dto.completado && !hito.completado ? new Date() : undefined,
    } as any);
    return this.hitoRepo.findOne({ where: { id } });
  }

  async deleteHito(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.hitoRepo.update({ id, empresaId }, { isActive: false });
    return { ok: true };
  }

  // ── Datos para Gantt ─────────────────────────────────────────────────────────

  async getGanttData(proyectoId: number) {
    const proyecto = await this.findById(proyectoId);
    const [tareas, hitos] = await Promise.all([
      this.getTareas(proyectoId),
      this.getHitos(proyectoId),
    ]);

    const proyInicio = new Date(proyecto.fechaInicio).getTime();

    const items = tareas.map(t => {
      const inicio  = t.fechaInicio      ? new Date(t.fechaInicio).getTime()      : proyInicio;
      const fin     = t.fechaVencimiento ? new Date(t.fechaVencimiento).getTime() : inicio + 7 * 24 * 3600000;
      const offsetDias = Math.round((inicio - proyInicio) / 86400000);
      const duraDias   = Math.max(1, Math.round((fin - inicio) / 86400000));
      return {
        id:           t.id,
        titulo:       t.titulo,
        estado:       t.estado,
        prioridad:    t.prioridad,
        asignado:     (t.asignado as any)?.nombre,
        offsetDias,
        duraDias,
        fechaInicio:  t.fechaInicio ?? proyecto.fechaInicio,
        fechaFin:     t.fechaVencimiento,
        esHito:       t.esHito,
        completada:   t.estado === EstadoTarea.COMPLETADA,
      };
    });

    const hitosGantt = hitos.map(h => ({
      id:         h.id,
      nombre:     h.nombre,
      fecha:      h.fecha,
      completado: h.completado,
      offsetDias: Math.round((new Date(h.fecha).getTime() - proyInicio) / 86400000),
    }));

    const duracionTotalDias = proyecto.fechaFin
      ? Math.round((new Date(proyecto.fechaFin).getTime() - proyInicio) / 86400000)
      : (items.reduce((max, t) => Math.max(max, t.offsetDias + t.duraDias), 30));

    return {
      proyecto: { id: proyecto.id, nombre: proyecto.nombre, fechaInicio: proyecto.fechaInicio, fechaFin: proyecto.fechaFin },
      items,
      hitos:    hitosGantt,
      duracionTotalDias,
    };
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────

  async getDashboard() {
    const empresaId = this.tenantService.getEmpresaId();
    const [activos, completados, enPausa] = await Promise.all([
      this.proyRepo.count({ where: { isActive: true, estado: EstadoProyecto.ACTIVO, empresaId } as any }),
      this.proyRepo.count({ where: { isActive: true, estado: EstadoProyecto.COMPLETADO, empresaId } as any }),
      this.proyRepo.count({ where: { isActive: true, estado: EstadoProyecto.EN_PAUSA, empresaId } as any }),
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
      where: { isActive: true, estado: EstadoProyecto.ACTIVO, empresaId } as any,
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
