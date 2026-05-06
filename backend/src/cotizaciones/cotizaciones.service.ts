import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Cotizacion, CotizacionEstado } from './entities/cotizacion.entity';
import { CotizacionDetalle } from './entities/cotizacion-detalle.entity';
import { Factura, FacturaEstado } from '../facturas/entities/factura.entity';
import { FacturaDetalle } from '../facturas/entities/factura-detalle.entity';
import { CreateCotizacionDto } from './dto/create-cotizacion.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { User } from '../users/users.entity';

@Injectable()
export class CotizacionesService {
  private readonly logger = new Logger(CotizacionesService.name);

  constructor(
    @InjectRepository(Cotizacion)
    private cotizacionRepository: Repository<Cotizacion>,
    @InjectRepository(CotizacionDetalle)
    private detalleRepository:    Repository<CotizacionDetalle>,
    @InjectRepository(Factura)
    private facturaRepository:    Repository<Factura>,
    @InjectRepository(FacturaDetalle)
    private facturaDetalleRepository: Repository<FacturaDetalle>,
    private tenantService:    TenantService,
    private realtimeService:  RealtimeService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────

  private async generarNumero(): Promise<string> {
    const now   = new Date();
    const y     = now.getFullYear();
    const m     = String(now.getMonth() + 1).padStart(2, '0');
    const count = await this.cotizacionRepository.count();
    return `COT-${y}${m}-${String(count + 1).padStart(4, '0')}`;
  }

  // ──────────────────────────────────────────────────────────────────
  // CRUD
  // ──────────────────────────────────────────────────────────────────

  async create(dto: CreateCotizacionDto, usuario: User) {
    const validez = dto.validezDias ?? 30;
    const fechaVencimiento = new Date(dto.fecha);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + validez);

    const detallesData: Partial<CotizacionDetalle>[] = [];
    let subtotal = 0, iva = 0;

    for (const item of dto.detalles) {
      const pIva   = item.porcentajeIva ?? 18;
      const sub    = Number(item.precioUnitario) * item.cantidad;
      const impIva = Number((sub * pIva / 100).toFixed(2));
      const total  = sub + impIva;
      subtotal += sub; iva += impIva;

      detallesData.push({
        productoId:     item.productoId,
        descripcion:    item.descripcion,
        precioUnitario: item.precioUnitario,
        cantidad:       item.cantidad,
        porcentajeIva:  pIva,
        subtotal:       sub,
        importeIva:     impIva,
        total,
      });
    }

    const numero = await this.generarNumero();
    const cot = await this.cotizacionRepository.save(
      this.cotizacionRepository.create({
        numero,
        fecha:            new Date(dto.fecha),
        fechaVencimiento,
        validezDias:      validez,
        empresaId:        this.tenantService.getEmpresaId(),
        clienteId:        dto.clienteId,
        userId:           usuario.id,
        notas:            dto.notas,
        condicionesPago:  dto.condicionesPago,
        vendedorId:       (dto as any).vendedorId,
        nombreVendedor:   (dto as any).nombreVendedor,
        subtotal:         Number(subtotal.toFixed(2)),
        iva:              Number(iva.toFixed(2)),
        total:            Number((subtotal + iva).toFixed(2)),
      }),
    );

    await this.detalleRepository.save(
      this.detalleRepository.create(detallesData.map(d => ({ ...d, cotizacionId: cot.id }))),
    );

    const empresaId = this.tenantService.getEmpresaId();
    this.realtimeService.notify(empresaId, 'cotizacion', 'created', cot.id);
    return this.findById(cot.id);
  }

  async findAll(pagination: PaginationDto) {
    const { limit = 10, page = 1, search } = pagination;
    const qb = this.cotizacionRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cliente', 'cliente')
      .where('c.empresaId = :eid', { eid: this.tenantService.getEmpresaId() })
      .andWhere('c.isActive = :a', { a: true });

    if (search) qb.andWhere(
      '(c.numero ILIKE :s OR cliente.nombre ILIKE :s)', { s: `%${search}%` },
    );

    const [data, total] = await qb
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const c = await this.cotizacionRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['cliente', 'user', 'detalles', 'detalles.producto', 'factura'],
    });
    if (!c) throw new NotFoundException(`Cotización #${id} no encontrada`);
    return c;
  }

  async cambiarEstado(id: number, estado: CotizacionEstado) {
    const cot = await this.findById(id);
    const permitidos: Record<CotizacionEstado, CotizacionEstado[]> = {
      [CotizacionEstado.BORRADOR]:   [CotizacionEstado.ENVIADA, CotizacionEstado.RECHAZADA],
      [CotizacionEstado.ENVIADA]:    [CotizacionEstado.ACEPTADA, CotizacionEstado.RECHAZADA],
      [CotizacionEstado.ACEPTADA]:   [CotizacionEstado.CONVERTIDA],
      [CotizacionEstado.RECHAZADA]:  [],
      [CotizacionEstado.VENCIDA]:    [],
      [CotizacionEstado.CONVERTIDA]: [],
    };
    if (!permitidos[cot.estado].includes(estado)) {
      throw new BadRequestException(`No se puede pasar de "${cot.estado}" a "${estado}"`);
    }
    await this.cotizacionRepository.update(id, { estado });
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'cotizacion', 'updated', id);
    return this.findById(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Conversión a Factura — la función estrella
  // ──────────────────────────────────────────────────────────────────

  async convertirAFactura(id: number, usuario: User) {
    const cot = await this.findById(id);

    if (cot.estado !== CotizacionEstado.ACEPTADA) {
      throw new BadRequestException('Solo se pueden convertir cotizaciones ACEPTADAS');
    }
    if (cot.facturaId) {
      throw new BadRequestException(`Esta cotización ya fue convertida a la factura #${cot.facturaId}`);
    }

    // Generar folio de factura
    const count  = await this.facturaRepository.count();
    const now    = new Date();
    const y      = now.getFullYear();
    const m      = String(now.getMonth() + 1).padStart(2, '0');
    const folio  = `FAC-${y}${m}-${String(count + 1).padStart(4, '0')}`;

    // Crear factura
    const factura = await this.facturaRepository.save(
      this.facturaRepository.create({
        empresaId: this.tenantService.getEmpresaId(),
        folio,
        fecha:    now,
        estado:   FacturaEstado.BORRADOR,
        clienteId: cot.clienteId,
        usuarioId: usuario.id,
        notas:    cot.notas ?? `Convertida desde cotización ${cot.numero}`,
        subtotal: Number(cot.subtotal),
        iva:      Number(cot.iva),
        total:    Number(cot.total),
      }),
    );

    // Copiar detalles
    await this.facturaDetalleRepository.save(
      this.facturaDetalleRepository.create(
        cot.detalles.map(d => ({
          facturaId:      factura.id,
          productoId:     d.productoId,
          descripcion:    d.descripcion,
          precioUnitario: Number(d.precioUnitario),
          cantidad:       d.cantidad,
          porcentajeIva:  Number(d.porcentajeIva),
          subtotal:       Number(d.subtotal),
          importeIva:     Number(d.importeIva),
          total:          Number(d.total),
        })),
      ),
    );

    // Marcar cotización como convertida
    await this.cotizacionRepository.update(id, {
      estado:    CotizacionEstado.CONVERTIDA,
      facturaId: factura.id,
    });

    this.logger.log(`Cotización ${cot.numero} convertida a factura ${folio}`);
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'cotizacion', 'updated', id);
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'factura',    'created');
    return this.findById(id);
  }

  async remove(id: number) {
    const cot = await this.findById(id);
    if (cot.estado !== CotizacionEstado.BORRADOR) {
      throw new BadRequestException('Solo se pueden eliminar cotizaciones en BORRADOR');
    }
    await this.cotizacionRepository.update(id, { isActive: false });
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'cotizacion', 'deleted', id);
    return { message: `Cotización ${cot.numero} eliminada` };
  }

  async getResumen() {
    const rows = await this.cotizacionRepository
      .createQueryBuilder('c')
      .select('c.estado', 'estado')
      .addSelect('COUNT(c.id)', 'cantidad')
      .addSelect('COALESCE(SUM(c.total), 0)', 'montoTotal')
      .where('c.empresaId = :eid AND c.isActive = true', { eid: this.tenantService.getEmpresaId() })
      .groupBy('c.estado')
      .getRawMany();

    return rows.map(r => ({
      estado:     r.estado,
      cantidad:   Number(r.cantidad),
      montoTotal: Number(r.montoTotal),
    }));
  }

  // ──────────────────────────────────────────────────────────────────
  // Cron: marcar cotizaciones vencidas diariamente
  // ──────────────────────────────────────────────────────────────────

  @Cron('5 0 * * *')
  async marcarVencidas() {
    const res = await this.cotizacionRepository.update(
      {
        estado: In([CotizacionEstado.BORRADOR, CotizacionEstado.ENVIADA]),
        fechaVencimiento: LessThan(new Date()),
        isActive: true,
      },
      { estado: CotizacionEstado.VENCIDA },
    );
    if ((res.affected ?? 0) > 0) {
      this.logger.log(`Cotizaciones vencidas marcadas: ${res.affected}`);
    }
  }
}
