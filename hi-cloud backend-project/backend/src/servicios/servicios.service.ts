import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  OrdenServicio, OrdenServicioDetalle, EstadoOrden,
} from './entities/orden-servicio.entity';
import { Factura, FacturaEstado } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { User } from '../users/users.entity';
import { TenantService } from '../tenant/tenant.service';

interface CreateOrdenDto {
  clienteId:           number;
  descripcionEquipo:   string;
  descripcionProblema: string;
  diagnostico?:        string;
  tecnicoId?:          number;
  fechaPromesa?:       string;
  presupuesto?:        number;
  notas?:              string;
  detalles?: Array<{
    productoId?: number; descripcion: string;
    cantidad: number; precioUnitario: number; tipo?: string;
  }>;
}

const TRANSICIONES: Record<EstadoOrden, EstadoOrden[]> = {
  [EstadoOrden.RECIBIDO]:          [EstadoOrden.EN_DIAGNOSTICO, EstadoOrden.CANCELADO],
  [EstadoOrden.EN_DIAGNOSTICO]:    [EstadoOrden.ESPERANDO_PIEZAS, EstadoOrden.EN_PROCESO, EstadoOrden.CANCELADO],
  [EstadoOrden.ESPERANDO_PIEZAS]:  [EstadoOrden.EN_PROCESO, EstadoOrden.CANCELADO],
  [EstadoOrden.EN_PROCESO]:        [EstadoOrden.LISTO, EstadoOrden.CANCELADO],
  [EstadoOrden.LISTO]:             [EstadoOrden.ENTREGADO, EstadoOrden.COBRADO],
  [EstadoOrden.ENTREGADO]:         [EstadoOrden.COBRADO],
  [EstadoOrden.COBRADO]:           [],
  [EstadoOrden.CANCELADO]:         [],
};

@Injectable()
export class ServiciosService {
  private readonly logger = new Logger(ServiciosService.name);

  constructor(
    @InjectRepository(OrdenServicio)
    private ordenRepo: Repository<OrdenServicio>,
    @InjectRepository(OrdenServicioDetalle)
    private detalleRepo: Repository<OrdenServicioDetalle>,
    @InjectRepository(Factura)
    private facturaRepo: Repository<Factura>,
    @InjectRepository(FacturaDetalle)
    private factDetalleRepo: Repository<FacturaDetalle>,
    private tenantService: TenantService,
  ) {}

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    const res = await this.ordenRepo
      .createQueryBuilder('o')
      .select(`MAX(CASE WHEN o.numero ~ '^SRV-[0-9]+$' THEN CAST(SUBSTRING(o.numero FROM 5) AS INTEGER) ELSE 100 END)`, 'maxNum')
      .where('o.empresaId = :eid', { eid: empresaId })
      .andWhere('o.isActive = :a', { a: true })
      .getRawOne<{ maxNum: number | null }>();
    return `SRV-${Math.max(101, (res?.maxNum ?? 100) + 1)}`;
  }

  async crear(dto: CreateOrdenDto, usuario: User): Promise<OrdenServicio> {
    const numero = await this.generarNumero();

    const detallesData = (dto.detalles ?? []).map(d => ({
      ...d,
      subtotal: d.cantidad * d.precioUnitario,
      tipo:     d.tipo ?? 'pieza',
    }));

    const totalPiezas   = detallesData.filter(d => d.tipo !== 'mano_obra').reduce((s, d) => s + d.subtotal, 0);
    const totalManoObra = detallesData.filter(d => d.tipo === 'mano_obra').reduce((s, d) => s + d.subtotal, 0);

    const orden = await this.ordenRepo.save(
      this.ordenRepo.create({
        empresaId:           this.tenantService.getEmpresaId(),
        numero,
        clienteId:           dto.clienteId,
        descripcionEquipo:   dto.descripcionEquipo,
        descripcionProblema: dto.descripcionProblema,
        diagnostico:         dto.diagnostico,
        tecnicoId:           dto.tecnicoId,
        fechaPromesa:        dto.fechaPromesa ? new Date(dto.fechaPromesa) : undefined,
        presupuesto:         dto.presupuesto,
        notas:               dto.notas,
        totalPiezas:         Number(totalPiezas.toFixed(2)),
        totalManoObra:       Number(totalManoObra.toFixed(2)),
        total:               Number((totalPiezas + totalManoObra).toFixed(2)),
        userId:              usuario.id,
      }),
    );

    if (detallesData.length > 0) {
      await this.detalleRepo.save(
        this.detalleRepo.create(detallesData.map(d => ({ ...d, ordenId: orden.id }))),
      );
    }

    return this.findById(orden.id);
  }

  async findAll(pagination: PaginationDto, estado?: EstadoOrden) {
    const { limit = 10, page = 1, search } = pagination;
    const qb = this.ordenRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.cliente', 'cliente')
      .where('o.empresaId = :eid', { eid: this.tenantService.getEmpresaId() }).andWhere('o.isActive = :a', { a: true });

    if (estado)  qb.andWhere('o.estado = :e', { e: estado });
    if (search)  qb.andWhere('(o.numero ILIKE :s OR cliente.nombre ILIKE :s OR o.descripcionEquipo ILIKE :s)', { s: `%${search}%` });

    const [data, total] = await qb
      .orderBy('o.createdAt', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: number): Promise<OrdenServicio> {
    const o = await this.ordenRepo.findOne({
      where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true },
      relations: ['cliente', 'tecnico', 'detalles'],
    });
    if (!o) throw new NotFoundException(`Orden #${id} no encontrada`);
    return o;
  }

  async cambiarEstado(id: number, nuevoEstado: EstadoOrden, notas?: string) {
    const orden = await this.findById(id);
    const permitidos = TRANSICIONES[orden.estado];
    if (!permitidos.includes(nuevoEstado)) {
      throw new BadRequestException(`No se puede pasar de "${orden.estado}" a "${nuevoEstado}"`);
    }
    await this.ordenRepo.update(id, { estado: nuevoEstado, notas: notas ?? orden.notas });
    return this.findById(id);
  }

  async actualizarDiagnostico(id: number, diagnostico: string, presupuesto?: number) {
    await this.findById(id);
    await this.ordenRepo.update(id, { diagnostico, presupuesto });
    return this.findById(id);
  }

  async agregarDetalle(ordenId: number, detalle: {
    productoId?: number; descripcion: string;
    cantidad: number; precioUnitario: number; tipo?: string;
  }) {
    const orden = await this.findById(ordenId);
    if ([EstadoOrden.ENTREGADO, EstadoOrden.COBRADO, EstadoOrden.CANCELADO].includes(orden.estado)) {
      throw new BadRequestException('No se pueden agregar detalles a una orden cerrada');
    }

    const subtotal = detalle.cantidad * detalle.precioUnitario;
    await this.detalleRepo.save(
      this.detalleRepo.create({ ...detalle, ordenId, subtotal, tipo: detalle.tipo ?? 'pieza' }),
    );

    // Recalcular totales
    const detalles = await this.detalleRepo.find({ where: { ordenId } });
    const totalPiezas   = detalles.filter(d => d.tipo !== 'mano_obra').reduce((s, d) => s + Number(d.subtotal), 0);
    const totalManoObra = detalles.filter(d => d.tipo === 'mano_obra').reduce((s, d) => s + Number(d.subtotal), 0);
    await this.ordenRepo.update(ordenId, {
      totalPiezas:   Number(totalPiezas.toFixed(2)),
      totalManoObra: Number(totalManoObra.toFixed(2)),
      total:         Number((totalPiezas + totalManoObra).toFixed(2)),
    });

    return this.findById(ordenId);
  }

  // ── Convertir orden a factura ──────────────────────────────────────────────

  async convertirAFactura(id: number, usuario: User) {
    const orden = await this.findById(id);
    if (orden.facturaId) {
      throw new BadRequestException(`Esta orden ya fue facturada (#${orden.facturaId})`);
    }
    if (orden.detalles.length === 0) {
      throw new BadRequestException('La orden no tiene detalles para facturar');
    }

    const count  = await this.facturaRepo.count();
    const now    = new Date();
    const y      = now.getFullYear();
    const m      = String(now.getMonth() + 1).padStart(2, '0');
    const folio  = `FAC-${y}${m}-${String(count + 1).padStart(4, '0')}`;

    const factura = await this.facturaRepo.save(
      this.facturaRepo.create({
        empresaId: this.tenantService.getEmpresaId(),
        folio,
        fecha:     now,
        estado:    FacturaEstado.BORRADOR,
        clienteId: orden.clienteId,
        usuarioId: usuario.id,
        notas:     `Servicio técnico: ${orden.numero} — ${orden.descripcionEquipo}`,
        subtotal:  Number(orden.total),
        iva:       Number((Number(orden.total) * 0.18).toFixed(2)),
        total:     Number((Number(orden.total) * 1.18).toFixed(2)),
      }),
    );

    await this.factDetalleRepo.save(
      this.factDetalleRepo.create(
        orden.detalles.map(d => ({
          facturaId:      factura.id,
          descripcion:    d.descripcion,
          cantidad:       Number(d.cantidad),
          precioUnitario: Number(d.precioUnitario),
          porcentajeIva:  18,
          subtotal:       Number(d.subtotal),
          importeIva:     Number((Number(d.subtotal) * 0.18).toFixed(2)),
          total:          Number((Number(d.subtotal) * 1.18).toFixed(2)),
        })),
      ),
    );

    await this.ordenRepo.update(id, {
      facturaId: factura.id,
      estado:    EstadoOrden.COBRADO,
    });

    this.logger.log(`Orden ${orden.numero} convertida a factura ${folio}`);
    return this.findById(id);
  }

  async getResumen() {
    const empresaId = this.tenantService.getEmpresaId();
    const rows = await this.ordenRepo
      .createQueryBuilder('o')
      .select('o.estado', 'estado')
      .addSelect('COUNT(o.id)', 'cantidad')
      .where('o.isActive = true')
      .andWhere('o.empresaId = :eid', { eid: empresaId })
      .groupBy('o.estado')
      .getRawMany();

    const vencidas = await this.ordenRepo
      .createQueryBuilder('o')
      .where('o.isActive = true AND o.estado NOT IN (:...excl) AND o."fechaPromesa" < CURRENT_DATE', {
        excl: [EstadoOrden.COBRADO, EstadoOrden.CANCELADO, EstadoOrden.ENTREGADO],
      })
      .andWhere('o.empresaId = :eid', { eid: empresaId })
      .getCount();

    return { porEstado: rows, ordenesVencidas: vencidas };
  }

  // ── Métodos avanzados ─────────────────────────────────────────────────────

  async getColaConsultores() {
    const empresaId = this.tenantService.getEmpresaId();
    const rows = await this.ordenRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.tecnico', 't')
      .select([
        'o.tecnicoId    AS "tecnicoId"',
        't.nombre       AS "tecnico"',
        'COUNT(o.id)    AS "totalOrdenes"',
        `SUM(CASE WHEN o.prioridad = 'urgente' THEN 1 ELSE 0 END) AS urgentes`,
        `SUM(CASE WHEN o.prioridad = 'alta'    THEN 1 ELSE 0 END) AS altas`,
      ])
      .where('o."empresaId" = :eid', { eid: empresaId })
      .andWhere('o.isActive = true')
      .andWhere('o.estado NOT IN (:...done)', { done: [EstadoOrden.COBRADO, EstadoOrden.CANCELADO, EstadoOrden.ENTREGADO] })
      .andWhere('o."tecnicoId" IS NOT NULL')
      .groupBy('o."tecnicoId", t.nombre')
      .orderBy('"totalOrdenes"', 'DESC')
      .getRawMany();

    return rows.map(r => ({
      tecnicoId:    r.tecnicoId,
      tecnico:      r.tecnico ?? 'Sin nombre',
      totalOrdenes: Number(r.totalOrdenes),
      urgentes:     Number(r.urgentes),
      altas:        Number(r.altas),
    }));
  }

  async getGarantiasProximas() {
    const empresaId = this.tenantService.getEmpresaId();
    const en30dias  = new Date(Date.now() + 30 * 24 * 3600000);
    return this.ordenRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.cliente', 'c')
      .where('o."empresaId" = :eid', { eid: empresaId })
      .andWhere('o.isActive = true')
      .andWhere('o."esGarantia" = true')
      .andWhere('o."fechaVencimientoGarantia" IS NOT NULL')
      .andWhere('o."fechaVencimientoGarantia" <= :f', { f: en30dias })
      .orderBy('o."fechaVencimientoGarantia"', 'ASC')
      .getMany();
  }

  async getSlaVencidos() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.ordenRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.cliente', 'c')
      .leftJoinAndSelect('o.tecnico', 't')
      .where('o."empresaId" = :eid', { eid: empresaId })
      .andWhere('o.isActive = true')
      .andWhere('o."fechaLimiteSla" IS NOT NULL')
      .andWhere('o."fechaLimiteSla" < NOW()')
      .andWhere('o.estado NOT IN (:...done)', { done: [EstadoOrden.COBRADO, EstadoOrden.CANCELADO, EstadoOrden.ENTREGADO] })
      .orderBy('o."fechaLimiteSla"', 'ASC')
      .getMany();
  }

  async getDashboardAvanzado() {
    const empresaId = this.tenantService.getEmpresaId();
    const [cola, garantias, slaVencidos] = await Promise.all([
      this.getColaConsultores(),
      this.getGarantiasProximas(),
      this.getSlaVencidos(),
    ]);

    const porPrioridad = await this.ordenRepo
      .createQueryBuilder('o')
      .select('o.prioridad', 'prioridad')
      .addSelect('COUNT(o.id)', 'cantidad')
      .where('o."empresaId" = :eid', { eid: empresaId })
      .andWhere('o.isActive = true')
      .andWhere('o.estado NOT IN (:...done)', { done: [EstadoOrden.COBRADO, EstadoOrden.CANCELADO] })
      .groupBy('o.prioridad')
      .getRawMany();

    return {
      colaConsultores:     cola,
      garantiasProximas:   garantias.length,
      slaVencidos:         slaVencidos.length,
      porPrioridad:        porPrioridad.map(r => ({ prioridad: r.prioridad, cantidad: Number(r.cantidad) })),
      alertas: {
        slaVencidos:   slaVencidos.length,
        garantias:     garantias.length,
        urgentes:      cola.reduce((s, c) => s + c.urgentes, 0),
      },
    };
  }
}
