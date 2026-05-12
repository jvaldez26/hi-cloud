import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SolicitudCompra,
  EstadoSolicitudCompra,
  PrioridadSolicitud,
} from './entities/solicitud-compra.entity';
import { SolicitudCompraLinea } from './entities/solicitud-compra-linea.entity';
import {
  CotizacionProveedor,
  EstadoCotizacionProveedor,
} from './entities/cotizacion-proveedor.entity';
import { CotizacionProveedorLinea } from './entities/cotizacion-proveedor-linea.entity';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class SolicitudesCompraService {
  constructor(
    @InjectRepository(SolicitudCompra)
    private solicitudRepo: Repository<SolicitudCompra>,
    @InjectRepository(SolicitudCompraLinea)
    private lineaSolRepo: Repository<SolicitudCompraLinea>,
    @InjectRepository(CotizacionProveedor)
    private cotizacionRepo: Repository<CotizacionProveedor>,
    @InjectRepository(CotizacionProveedorLinea)
    private lineaCotRepo: Repository<CotizacionProveedorLinea>,
    private tenantService: TenantService,
  ) {}

  // ─── Numeración ───────────────────────────────────────────────────────────

  private async nextNumeroSolicitud(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    const total = await this.solicitudRepo.count({ where: { empresaId } });
    const anio  = new Date().getFullYear();
    return `SC-${anio}-${String(total + 1).padStart(4, '0')}`;
  }

  private async nextNumeroCotizacion(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    const total = await this.cotizacionRepo.count({ where: { empresaId } });
    const anio  = new Date().getFullYear();
    return `RFQ-${anio}-${String(total + 1).padStart(4, '0')}`;
  }

  // ─── Solicitudes de Compra ────────────────────────────────────────────────

  async crearSolicitud(dto: {
    justificacion: string;
    fechaNecesidad?: string;
    prioridad?: PrioridadSolicitud;
    departamento?: string;
    presupuestoEstimado?: number;
    lineas: Array<{
      descripcion: string;
      cantidad: number;
      unidad?: string;
      productoId?: number;
      presupuestoUnitario?: number;
      especificaciones?: string;
    }>;
  }, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const numero    = await this.nextNumeroSolicitud();

    const solicitud = this.solicitudRepo.create({
      numero,
      solicitanteId:       userId,
      fechaSolicitud:      new Date(),
      fechaNecesidad:      dto.fechaNecesidad ? new Date(dto.fechaNecesidad) : undefined,
      justificacion:       dto.justificacion,
      prioridad:           dto.prioridad ?? PrioridadSolicitud.MEDIA,
      departamento:        dto.departamento,
      presupuestoEstimado: dto.presupuestoEstimado ?? 0,
      estado:              EstadoSolicitudCompra.BORRADOR,
      empresaId,
    });
    const saved = await this.solicitudRepo.save(solicitud);

    const lineas = (dto.lineas ?? []).map(l =>
      this.lineaSolRepo.create({
        solicitudId:          saved.id,
        descripcion:          l.descripcion,
        cantidad:             l.cantidad,
        unidad:               l.unidad ?? 'UND',
        productoId:           l.productoId,
        presupuestoUnitario:  l.presupuestoUnitario ?? 0,
        especificaciones:     l.especificaciones,
        empresaId,
      }),
    );
    await this.lineaSolRepo.save(lineas);

    return this.findSolicitudById(saved.id);
  }

  async getSolicitudes(filtro: { page?: number; limit?: number; estado?: string; prioridad?: string; search?: string }) {
    const empresaId = this.tenantService.getEmpresaId();
    const { page = 1, limit = 15, estado, prioridad, search } = filtro;

    const qb = this.solicitudRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.solicitante', 'usr')
      .leftJoinAndSelect('s.lineas', 'lineas')
      .where('s.empresaId = :eid', { eid: empresaId })
      .andWhere('s.isActive = true');

    if (estado)    qb.andWhere('s.estado = :estado', { estado });
    if (prioridad) qb.andWhere('s.prioridad = :prioridad', { prioridad });
    if (search)    qb.andWhere('(s.numero ILIKE :s OR s.justificacion ILIKE :s OR s.departamento ILIKE :s)', { s: `%${search}%` });

    const [data, total] = await qb
      .orderBy('s.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findSolicitudById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const s = await this.solicitudRepo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['solicitante', 'lineas'],
    });
    if (!s) throw new NotFoundException(`Solicitud #${id} no encontrada`);
    return s;
  }

  async cambiarEstadoSolicitud(
    id: number,
    nuevoEstado: EstadoSolicitudCompra,
    userId: number,
    comentario?: string,
  ) {
    const s = await this.findSolicitudById(id);

    const transicionesValidas: Partial<Record<EstadoSolicitudCompra, EstadoSolicitudCompra[]>> = {
      [EstadoSolicitudCompra.BORRADOR]:      [EstadoSolicitudCompra.ENVIADA, EstadoSolicitudCompra.CANCELADA],
      [EstadoSolicitudCompra.ENVIADA]:       [EstadoSolicitudCompra.APROBADA, EstadoSolicitudCompra.RECHAZADA, EstadoSolicitudCompra.CANCELADA],
      [EstadoSolicitudCompra.APROBADA]:      [EstadoSolicitudCompra.EN_COTIZACION, EstadoSolicitudCompra.PROCESADA],
      [EstadoSolicitudCompra.EN_COTIZACION]: [EstadoSolicitudCompra.PROCESADA],
    };

    if (!transicionesValidas[s.estado]?.includes(nuevoEstado)) {
      throw new BadRequestException(`No se puede pasar de "${s.estado}" a "${nuevoEstado}"`);
    }

    const update: Partial<SolicitudCompra> = { estado: nuevoEstado };
    if (nuevoEstado === EstadoSolicitudCompra.APROBADA || nuevoEstado === EstadoSolicitudCompra.RECHAZADA) {
      update.aprobadorId         = userId;
      update.fechaAprobacion     = new Date();
      update.comentarioAprobacion = comentario;
    }

    await this.solicitudRepo.update(id, update as any);
    return this.findSolicitudById(id);
  }

  async getResumenSolicitudes() {
    const empresaId = this.tenantService.getEmpresaId();
    const raw = await this.solicitudRepo
      .createQueryBuilder('s')
      .select('s.estado', 'estado')
      .addSelect('COUNT(*)', 'total')
      .where('s.empresaId = :eid', { eid: empresaId })
      .andWhere('s.isActive = true')
      .groupBy('s.estado')
      .getRawMany();

    return raw.reduce((acc: any, r: any) => { acc[r.estado] = Number(r.total); return acc; }, {});
  }

  // ─── Cotizaciones a Proveedores (RFQ) ─────────────────────────────────────

  async crearCotizacion(dto: {
    solicitudId?: number;
    proveedorId: number;
    fechaEnvio?: string;
    fechaValidez?: string;
    tiempoEntregaDias?: number;
    condicionesPago?: string;
    notas?: string;
    lineas: Array<{
      descripcion: string;
      cantidad: number;
      precioUnitario: number;
      porcentajeItbis?: number;
      unidad?: string;
      productoId?: number;
    }>;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const numero    = await this.nextNumeroCotizacion();

    const lineasCalculadas = (dto.lineas ?? []).map(l => {
      const itbis = Number(((l.precioUnitario * l.cantidad * (l.porcentajeItbis ?? 18)) / 100).toFixed(2));
      const total = Number((l.precioUnitario * l.cantidad + itbis).toFixed(2));
      return { ...l, itbis, total, porcentajeItbis: l.porcentajeItbis ?? 18 };
    });

    const subtotal = Number(lineasCalculadas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0).toFixed(2));
    const itbis    = Number(lineasCalculadas.reduce((s, l) => s + l.itbis, 0).toFixed(2));
    const total    = Number((subtotal + itbis).toFixed(2));

    const cot = this.cotizacionRepo.create({
      numero,
      solicitudId:       dto.solicitudId,
      proveedorId:       dto.proveedorId,
      fechaEnvio:        dto.fechaEnvio ? new Date(dto.fechaEnvio) : new Date(),
      fechaValidez:      dto.fechaValidez ? new Date(dto.fechaValidez) : undefined,
      tiempoEntregaDias: dto.tiempoEntregaDias ?? 0,
      condicionesPago:   dto.condicionesPago,
      notas:             dto.notas,
      estado:            EstadoCotizacionProveedor.ENVIADA,
      subtotal,
      itbis,
      total,
      empresaId,
    });

    const savedCot = await this.cotizacionRepo.save(cot);

    const lineas = lineasCalculadas.map(l =>
      this.lineaCotRepo.create({ ...l, cotizacionId: savedCot.id, empresaId }),
    );
    await this.lineaCotRepo.save(lineas);

    // Actualizar solicitud a en_cotizacion si aplica
    if (dto.solicitudId) {
      const sol = await this.solicitudRepo.findOne({ where: { id: dto.solicitudId, empresaId, isActive: true } });
      if (sol && sol.estado === EstadoSolicitudCompra.APROBADA) {
        await this.solicitudRepo.update(dto.solicitudId, { estado: EstadoSolicitudCompra.EN_COTIZACION });
      }
    }

    return this.findCotizacionById(savedCot.id);
  }

  async getCotizaciones(filtro: { page?: number; limit?: number; solicitudId?: number; estado?: string }) {
    const empresaId = this.tenantService.getEmpresaId();
    const { page = 1, limit = 15, solicitudId, estado } = filtro;

    const qb = this.cotizacionRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.proveedor', 'prov')
      .leftJoinAndSelect('c.lineas', 'lineas')
      .where('c.empresaId = :eid', { eid: empresaId })
      .andWhere('c.isActive = true');

    if (solicitudId) qb.andWhere('c.solicitudId = :sid', { sid: solicitudId });
    if (estado)      qb.andWhere('c.estado = :estado', { estado });

    const [data, total] = await qb
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findCotizacionById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const c = await this.cotizacionRepo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['proveedor', 'lineas', 'solicitud'],
    });
    if (!c) throw new NotFoundException(`Cotización #${id} no encontrada`);
    return c;
  }

  async registrarRespuestaCotizacion(id: number, dto: {
    fechaRespuesta?: string;
    tiempoEntregaDias?: number;
    condicionesPago?: string;
    notas?: string;
    lineas: Array<{
      descripcion: string;
      cantidad: number;
      precioUnitario: number;
      porcentajeItbis?: number;
      unidad?: string;
      productoId?: number;
    }>;
  }) {
    const cot = await this.findCotizacionById(id);
    if (cot.estado === EstadoCotizacionProveedor.SELECCIONADA) {
      throw new BadRequestException('No se puede modificar una cotización ya seleccionada');
    }

    const lineasCalculadas = dto.lineas.map(l => {
      const itbis = Number(((l.precioUnitario * l.cantidad * (l.porcentajeItbis ?? 18)) / 100).toFixed(2));
      const total = Number((l.precioUnitario * l.cantidad + itbis).toFixed(2));
      return { ...l, itbis, total, porcentajeItbis: l.porcentajeItbis ?? 18 };
    });

    const subtotal = Number(lineasCalculadas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0).toFixed(2));
    const itbis    = Number(lineasCalculadas.reduce((s, l) => s + l.itbis, 0).toFixed(2));
    const total    = Number((subtotal + itbis).toFixed(2));

    // Eliminar líneas viejas y crear nuevas
    await this.lineaCotRepo.delete({ cotizacionId: id });

    const lineas = lineasCalculadas.map(l =>
      this.lineaCotRepo.create({ ...l, cotizacionId: id, empresaId: cot.empresaId }),
    );
    await this.lineaCotRepo.save(lineas);

    await this.cotizacionRepo.update(id, {
      estado:            EstadoCotizacionProveedor.RECIBIDA,
      fechaRespuesta:    dto.fechaRespuesta ? new Date(dto.fechaRespuesta) : new Date(),
      tiempoEntregaDias: dto.tiempoEntregaDias ?? cot.tiempoEntregaDias,
      condicionesPago:   dto.condicionesPago ?? cot.condicionesPago,
      notas:             dto.notas ?? cot.notas,
      subtotal, itbis, total,
    } as any);

    return this.findCotizacionById(id);
  }

  async seleccionarCotizacion(id: number) {
    const cot = await this.findCotizacionById(id);

    if (cot.estado !== EstadoCotizacionProveedor.RECIBIDA) {
      throw new BadRequestException('Solo se pueden seleccionar cotizaciones con respuesta recibida');
    }

    // Rechazar las otras cotizaciones del mismo solicitudId
    if (cot.solicitudId) {
      await this.cotizacionRepo
        .createQueryBuilder()
        .update()
        .set({ estado: EstadoCotizacionProveedor.RECHAZADA })
        .where('solicitudId = :sid', { sid: cot.solicitudId })
        .andWhere('id != :id', { id })
        .andWhere('estado = :est', { est: EstadoCotizacionProveedor.RECIBIDA })
        .execute();

      await this.solicitudRepo.update(cot.solicitudId, { estado: EstadoSolicitudCompra.PROCESADA });
    }

    await this.cotizacionRepo.update(id, { estado: EstadoCotizacionProveedor.SELECCIONADA });
    return this.findCotizacionById(id);
  }

  // ─── Comparativo de Propuestas ─────────────────────────────────────────────

  async getComparativo(solicitudId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const solicitud = await this.findSolicitudById(solicitudId);

    const cotizaciones = await this.cotizacionRepo.find({
      where: { solicitudId, empresaId, isActive: true },
      relations: ['proveedor', 'lineas'],
      order: { total: 'ASC' },
    });

    if (cotizaciones.length === 0) {
      return { solicitud, cotizaciones: [], comparativo: [] };
    }

    const todasDescripciones = new Set<string>();
    cotizaciones.forEach(c =>
      c.lineas.forEach(l => todasDescripciones.add(l.descripcion)),
    );

    const comparativo = Array.from(todasDescripciones).map(desc => ({
      descripcion: desc,
      proveedores: cotizaciones.map(c => {
        const linea = c.lineas.find(l => l.descripcion === desc);
        return {
          proveedorId:   c.proveedorId,
          proveedor:     c.proveedor?.nombre ?? '',
          cotizacionId:  c.id,
          numero:        c.numero,
          precioUnitario: linea ? Number(linea.precioUnitario) : null,
          cantidad:       linea ? Number(linea.cantidad)       : null,
          total:          linea ? Number(linea.total)          : null,
          itbis:          linea ? Number(linea.itbis)          : null,
          disponible:     !!linea,
        };
      }),
    }));

    const menorPorLinea = comparativo.map(linea => {
      const precios = linea.proveedores.filter(p => p.precioUnitario !== null).map(p => p.precioUnitario!);
      return { descripcion: linea.descripcion, menorPrecio: precios.length > 0 ? Math.min(...precios) : null };
    });

    return {
      solicitud,
      cotizaciones: cotizaciones.map(c => ({
        id:               c.id,
        numero:           c.numero,
        proveedor:        c.proveedor?.nombre,
        estado:           c.estado,
        subtotal:         Number(c.subtotal),
        itbis:            Number(c.itbis),
        total:            Number(c.total),
        tiempoEntregaDias: c.tiempoEntregaDias,
        condicionesPago:  c.condicionesPago,
        seleccionada:     c.estado === EstadoCotizacionProveedor.SELECCIONADA,
      })),
      comparativo,
      menorPorLinea,
    };
  }
}
