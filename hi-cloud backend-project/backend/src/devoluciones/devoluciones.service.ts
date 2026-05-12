import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Devolucion, EstadoDevolucion } from './entities/devolucion.entity';
import { DevolucionDetalle } from './entities/devolucion-detalle.entity';
import { Factura } from '../facturas/entities/factura.entity';
import { NotaCredito, EstadoNotaCredito, MotivoNotaCredito } from '../notas-credito/entities/nota-credito.entity';
import { NotaCreditoDetalle } from '../notas-credito/entities/nota-credito-detalle.entity';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { InventarioService } from '../inventario/inventario.service';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { User } from '../users/users.entity';

@Injectable()
export class DevolucionesService {
  private readonly logger = new Logger(DevolucionesService.name);

  constructor(
    @InjectRepository(Devolucion)        private devRepository:      Repository<Devolucion>,
    @InjectRepository(DevolucionDetalle) private detalleRepository:  Repository<DevolucionDetalle>,
    @InjectRepository(Factura)           private facturaRepository:  Repository<Factura>,
    @InjectRepository(NotaCredito)       private ncRepository:       Repository<NotaCredito>,
    @InjectRepository(NotaCreditoDetalle) private ncDetRepository:   Repository<NotaCreditoDetalle>,
    private inventarioService: InventarioService,
    private asientosService:   AsientosAutomaticosService,
    private tenantService:     TenantService,
  ) {}

  // ─── Folios ───────────────────────────────────────────────────────────────────

  private async generarNumero(): Promise<string> {
    const now   = new Date();
    const y     = now.getFullYear();
    const m     = String(now.getMonth() + 1).padStart(2, '0');
    const count = await this.devRepository.count();
    return `DEV-${y}${m}-${String(count + 1).padStart(4, '0')}`;
  }

  private async generarNumeroNC(): Promise<string> {
    const d   = new Date();
    const pre = `NC-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-`;
    const res = await this.ncRepository
      .createQueryBuilder('nc')
      .select(`MAX(CAST(SPLIT_PART(nc.numero, '-', 3) AS INTEGER))`, 'maxNum')
      .where('nc.numero LIKE :p', { p: `${pre}%` })
      .getRawOne<{ maxNum: number | null }>();
    return `${pre}${String((res?.maxNum ?? 0) + 1).padStart(4, '0')}`;
  }

  // ─── Crear devolución ─────────────────────────────────────────────────────────

  async create(dto: CreateDevolucionDto, usuario: User) {
    const factura = await this.facturaRepository.findOne({
      where: { id: dto.facturaId, isActive: true },
      relations: ['cliente'],
    });
    if (!factura) throw new NotFoundException(`Factura #${dto.facturaId} no encontrada`);

    if (!['emitida', 'pagada'].includes(factura.estado)) {
      throw new BadRequestException('Solo se pueden devolver facturas emitidas o pagadas');
    }

    const detallesData: Partial<DevolucionDetalle>[] = [];
    let subtotal = 0, iva = 0;

    for (const item of dto.detalles) {
      const pIva   = item.porcentajeIva ?? 18;
      const sub    = Number(item.precioUnitario) * item.cantidad;
      const impIva = Number((sub * pIva / 100).toFixed(2));
      subtotal += sub; iva += impIva;

      detallesData.push({
        productoId:     item.productoId,
        descripcion:    item.descripcion,
        precioUnitario: item.precioUnitario,
        cantidad:       item.cantidad,
        porcentajeIva:  pIva,
        subtotal:       sub,
        importeIva:     impIva,
        total:          sub + impIva,
      });
    }

    const numero = await this.generarNumero();
    const dev = await this.devRepository.save(
      this.devRepository.create({
        empresaId: this.tenantService.getEmpresaId(),
        numero,
        fecha:     new Date(dto.fecha),
        tipo:      dto.tipo,
        facturaId: dto.facturaId,
        clienteId: factura.clienteId,
        motivo:    dto.motivo,
        userId:    usuario.id,
        subtotal:  Number(subtotal.toFixed(2)),
        iva:       Number(iva.toFixed(2)),
        total:     Number((subtotal + iva).toFixed(2)),
      }),
    );

    await this.detalleRepository.save(
      this.detalleRepository.create(detallesData.map(d => ({ ...d, devolucionId: dev.id }))),
    );

    return this.findById(dev.id);
  }

  // ─── Listar ───────────────────────────────────────────────────────────────────

  async findAll(pagination: PaginationDto) {
    const { limit = 10, page = 1, search } = pagination;
    const qb = this.devRepository
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.cliente', 'cliente')
      .leftJoinAndSelect('d.factura', 'factura')
      .where('d.isActive = :a', { a: true });

    if (search) qb.andWhere(
      '(d.numero ILIKE :s OR cliente.nombre ILIKE :s OR factura.folio ILIKE :s)',
      { s: `%${search}%` },
    );

    const [data, total] = await qb
      .orderBy('d.createdAt', 'DESC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: number) {
    const d = await this.devRepository.findOne({
      where: { id, isActive: true },
      relations: ['cliente', 'factura', 'detalles', 'detalles.producto', 'user'],
    });
    if (!d) throw new NotFoundException(`Devolución #${id} no encontrada`);
    return d;
  }

  // ─── Procesar + generar Nota de Crédito E34 ──────────────────────────────────

  async procesar(id: number, usuario: User) {
    const dev = await this.findById(id);

    if (dev.estado !== EstadoDevolucion.PENDIENTE) {
      throw new BadRequestException(`La devolución está "${dev.estado}" — ya fue procesada o anulada`);
    }

    // 1. Devolver inventario
    for (const detalle of dev.detalles) {
      if (detalle.productoId) {
        await this.inventarioService.registrarDevolucion(
          detalle.productoId,
          detalle.cantidad,
          usuario.id,
          `Devolución ${dev.numero} — ${dev.motivo}`,
          dev.numero,
        );
      }
    }

    // 2. Asiento contable de reversa
    await this.asientosService.asientoDevolucionVenta(
      dev.id,
      Number(dev.total),
      Number(dev.subtotal),
      Number(dev.iva),
      dev.numero,
      usuario.id,
    );

    // 3. ── Generar Nota de Crédito E34 automáticamente ──────────────────────────
    const ncNumero = await this.generarNumeroNC();

    const nc = await this.ncRepository.save(
      this.ncRepository.create({
        empresaId:            this.tenantService.getEmpresaId(),
        numero:               ncNumero,
        fecha:                new Date() as unknown as Date,
        tipoNcf:              'E34',
        facturaOriginalId:    dev.facturaId,
        facturaOriginalFolio: (dev.factura as any)?.folio,
        clienteId:            dev.clienteId,
        usuarioId:            usuario.id,
        motivo:               MotivoNotaCredito.DEVOLUCION,
        descripcionMotivo:    `Devolución ${dev.numero}: ${dev.motivo}`,
        subtotal:             Number(dev.subtotal),
        iva:                  Number(dev.iva),
        total:                Number(dev.total),
        estado:               EstadoNotaCredito.EMITIDA,
      }),
    );

    // Detalles de la NC copiados de la devolución
    const ncDetalles = dev.detalles.map(det => ({
      notaCreditoId:  nc.id,
      productoId:     det.productoId,
      descripcion:    det.descripcion,
      unidadMedida:   'PZA',
      cantidad:       Number(det.cantidad),
      precioUnitario: Number(det.precioUnitario),
      porcentajeIva:  Number(det.porcentajeIva ?? 18),
      subtotal:       Number(det.subtotal),
      iva:            Number(det.importeIva ?? 0),
      total:          Number(det.total),
    }));
    await this.ncDetRepository.save(this.ncDetRepository.create(ncDetalles));

    // 4. Marcar devolución como procesada con referencia a la NC
    await this.devRepository.update(id, {
      estado:            EstadoDevolucion.PROCESADA,
      notaCreditoId:     nc.id,
      notaCreditoNumero: ncNumero,
    });

    this.logger.log(`Devolución ${dev.numero} procesada → Nota de Crédito E34 ${ncNumero} generada automáticamente`);
    return this.findById(id);
  }

  // ─── Anular ───────────────────────────────────────────────────────────────────

  async anular(id: number) {
    const dev = await this.findById(id);
    if (dev.estado === EstadoDevolucion.PROCESADA) {
      throw new BadRequestException('No se puede anular una devolución ya procesada');
    }
    await this.devRepository.update(id, { estado: EstadoDevolucion.ANULADA });
    return this.findById(id);
  }

  // ─── Resumen ─────────────────────────────────────────────────────────────────

  async getResumen() {
    return this.devRepository
      .createQueryBuilder('d')
      .select('d.estado', 'estado')
      .addSelect('COUNT(d.id)', 'cantidad')
      .addSelect('COALESCE(SUM(d.total), 0)', 'montoTotal')
      .where('d.isActive = true')
      .groupBy('d.estado')
      .getRawMany();
  }
}
