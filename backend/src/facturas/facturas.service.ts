import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Factura, FacturaEstado } from './entities/factura.entity';
import { FacturaDetalle } from './entities/factura-detalle.entity';
import { CreateFacturaDto } from './dto/create-factura.dto';
import { ClientesService } from '../clientes/clientes.service';
import { ProductosService } from '../productos/productos.service';
import { InventarioService } from '../inventario/inventario.service';
import { ECFService } from '../ecf/ecf.service';
import { CxCService } from '../cxc/cxc.service';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { User } from '../users/users.entity';
import { LimitesService } from '../suscripciones/limites.service';

@Injectable()
export class FacturasService {
  constructor(
    @InjectRepository(Factura)
    private facturaRepository: Repository<Factura>,
    @InjectRepository(FacturaDetalle)
    private detalleRepository: Repository<FacturaDetalle>,
    private clientesService: ClientesService,
    private productosService: ProductosService,
    private inventarioService: InventarioService,
    private ecfService: ECFService,
    private cxcService: CxCService,
    private asientosService: AsientosAutomaticosService,
    private tenantService: TenantService,
    private realtimeService: RealtimeService,
    private limitesService: LimitesService,
  ) {}

  private async generarFolio(): Promise<string> {
    const now    = new Date();
    const year   = now.getFullYear();
    const month  = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `FAC-${year}${month}-`;

    // MAX del número actual del período evita duplicados bajo carga concurrente
    // El constraint UNIQUE en la columna folio actúa como red de seguridad final
    const result = await this.facturaRepository
      .createQueryBuilder('f')
      .select(`MAX(CAST(SPLIT_PART(f.folio, '-', 3) AS INTEGER))`, 'maxNum')
      .where('f.folio LIKE :p', { p: `${prefix}%` })
      .getRawOne<{ maxNum: number | null }>();

    const next = (result?.maxNum ?? 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  async create(dto: CreateFacturaDto, usuario: User) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.limitesService.verificarLimiteFacturas(empresaId);
    await this.clientesService.findOne(dto.clienteId);

    const detalles: Partial<FacturaDetalle>[] = [];
    let subtotalFactura = 0;
    let ivaFactura = 0;

    for (const item of dto.detalles) {
      const producto = await this.productosService.findOne(item.productoId);
      const porcentajeIva = item.porcentajeIva ?? Number(producto.porcentajeIva);
      const subtotal = Number(item.precioUnitario) * item.cantidad;
      const importeIva = subtotal * (porcentajeIva / 100);
      const total = subtotal + importeIva;

      subtotalFactura += subtotal;
      ivaFactura += importeIva;

      detalles.push({
        productoId: item.productoId,
        descripcion: item.descripcion || producto.nombre,
        precioUnitario: item.precioUnitario,
        cantidad: item.cantidad,
        porcentajeIva,
        subtotal,
        importeIva,
        total,
      });
    }

    const folio = await this.generarFolio();

    const moneda     = dto.moneda ?? 'DOP';
    const tipoCambio = dto.tipoCambio ?? 1;
    const totalDOP   = subtotalFactura + ivaFactura;
    // Si es moneda extranjera, totalOriginal = monto en esa moneda; total = DOP
    const totalOriginal = moneda !== 'DOP' ? +(totalDOP / tipoCambio).toFixed(2) : undefined;

    const factura = this.facturaRepository.create({
      folio,
      fecha: new Date(dto.fecha),
      empresaId,
      clienteId: dto.clienteId,
      usuarioId: usuario.id,
      notas:          dto.notas,
      tipoNcf:        dto.tipoNcf ?? 'E32',
      vendedorId:     dto.vendedorId,
      nombreVendedor: dto.nombreVendedor,
      sucursalId:     dto.sucursalId,
      moneda,
      tipoCambio,
      totalOriginal,
      subtotal: subtotalFactura,
      iva:      ivaFactura,
      total:    totalDOP,
    });

    const savedFactura = await this.facturaRepository.save(factura);

    const savedDetalles = this.detalleRepository.create(
      detalles.map((d) => ({ ...d, facturaId: savedFactura.id })),
    );
    await this.detalleRepository.save(savedDetalles);

    this.realtimeService.notify(empresaId, 'factura', 'created', savedFactura.id);
    return this.findOne(savedFactura.id);
  }

  async findAll(pagination: PaginationDto) {
    const empresaId = this.tenantService.getEmpresaId();
    const { limit = 10, page = 1, search } = pagination;

    const qb = this.facturaRepository
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.cliente', 'cliente')
      .where('f.empresaId = :empresaId', { empresaId })
      .andWhere('f.isActive = :active', { active: true });

    if (search) {
      qb.andWhere(
        '(f.folio ILIKE :s OR cliente.nombre ILIKE :s OR cliente.rfc ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('f.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const factura = await this.facturaRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['cliente', 'usuario', 'detalles', 'detalles.producto'],
    });
    if (!factura) throw new NotFoundException(`Factura #${id} no encontrada`);
    return factura;
  }

  // ── Detecta si el pago es inmediato según el campo notas ─────────────────────
  private esPagoInmediato(notas: string | undefined | null): boolean {
    const n = (notas ?? '').toLowerCase();
    return /efectivo|tarjeta|transferencia|cheque|pos\s*·/.test(n);
  }

  async cambiarEstado(id: number, estado: FacturaEstado) {
    const factura = await this.findOne(id);

    const transiciones: Record<FacturaEstado, FacturaEstado[]> = {
      [FacturaEstado.BORRADOR]:  [FacturaEstado.EMITIDA,  FacturaEstado.CANCELADA],
      [FacturaEstado.EMITIDA]:   [FacturaEstado.PAGADA,   FacturaEstado.CANCELADA],
      [FacturaEstado.PAGADA]:    [],
      [FacturaEstado.CANCELADA]: [],
    };

    if (!transiciones[factura.estado].includes(estado)) {
      throw new BadRequestException(
        `No se puede cambiar de "${factura.estado}" a "${estado}"`,
      );
    }

    if (estado === FacturaEstado.EMITIDA) {
      const pagoInmediato = this.esPagoInmediato(factura.notas);

      // 1. Generar e-CF (fallo no bloquea emisión)
      await this.ecfService.generarECF(factura, factura.usuarioId);

      // 2. Salida de inventario
      for (const detalle of factura.detalles) {
        await this.inventarioService.registrarSalida(
          detalle.productoId,
          Number(detalle.cantidad),
          factura.usuarioId,
          `Factura emitida: ${factura.folio}`,
          factura.folio,
        );
      }

      // 3. CxC — solo si el pago NO es inmediato (efectivo/tarjeta/transferencia/cheque)
      //    Los pagos inmediatos no generan cuenta por cobrar
      if (!pagoInmediato) {
        await this.cxcService.crear(factura.id, factura.usuarioId);
      }

      // 4. Asiento contable
      await this.asientosService.asientoFacturaEmitida(
        factura.id,
        Number(factura.total),
        Number(factura.subtotal),
        Number(factura.iva),
        factura.folio,
        factura.usuarioId,
      );

      // 5. Si el pago es inmediato → marcar directamente como PAGADA
      if (pagoInmediato) {
        await this.facturaRepository.update(id, { estado: FacturaEstado.PAGADA });
        this.realtimeService.notify(factura.empresaId, 'factura', 'updated', id);
        return this.findOne(id);
      }
    }

    if (estado === FacturaEstado.CANCELADA && factura.estado === FacturaEstado.EMITIDA) {
      for (const detalle of factura.detalles) {
        await this.inventarioService.registrarDevolucion(
          detalle.productoId,
          Number(detalle.cantidad),
          factura.usuarioId,
          `Cancelación factura: ${factura.folio}`,
          factura.folio,
        );
      }
    }

    await this.facturaRepository.update(id, { estado });
    this.realtimeService.notify(factura.empresaId, 'factura', 'updated', id);
    return this.findOne(id);
  }

  async remove(id: number) {
    const factura = await this.findOne(id);
    if (factura.estado !== FacturaEstado.BORRADOR) {
      throw new BadRequestException('Solo se pueden eliminar facturas en estado borrador');
    }
    await this.facturaRepository.update(id, { isActive: false });
    return { message: `Factura ${factura.folio} eliminada` };
  }

  async resumenPorEstado() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.facturaRepository
      .createQueryBuilder('f')
      .select('f.estado', 'estado')
      .addSelect('COUNT(f.id)', 'cantidad')
      .addSelect('SUM(f.total)', 'montoTotal')
      .where('f.empresaId = :empresaId', { empresaId })
      .andWhere('f.isActive = :active', { active: true })
      .groupBy('f.estado')
      .getRawMany();
  }
}
