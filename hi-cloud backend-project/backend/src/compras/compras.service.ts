import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Compra, CompraEstado } from './entities/compra.entity';
import { CompraDetalle } from './entities/compra-detalle.entity';
import { CreateCompraDto } from './dto/create-compra.dto';
import { ProveedoresService } from '../proveedores/proveedores.service';
import { ProductosService } from '../productos/productos.service';
import { InventarioService } from '../inventario/inventario.service';
import { CxPService } from '../cxp/cxp.service';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';
import { RealtimeService } from '../realtime/realtime.service';
import { User } from '../users/users.entity';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';

const ITBIS_DEFAULT = 18;

@Injectable()
export class ComprasService {
  constructor(
    @InjectRepository(Compra)
    private compraRepository: Repository<Compra>,
    @InjectRepository(CompraDetalle)
    private detalleRepository:  Repository<CompraDetalle>,
    private proveedoresService: ProveedoresService,
    private productosService:   ProductosService,
    private inventarioService:  InventarioService,
    private cxpService:         CxPService,
    private asientosService:    AsientosAutomaticosService,
    private tenantService:      TenantService,
    private realtimeService:    RealtimeService,
    @InjectDataSource() private ds: DataSource,
  ) {}

  private async generarFolio(): Promise<string> {
    const empresaId  = this.tenantService.getEmpresaId();
    const sucursalId = this.tenantService.getSucursalId();
    // Secuencia independiente por sucursal cuando hay contexto de sucursal activo
    const prefijo = 'COM-';
    const tipo    = sucursalId ? `COM_S${sucursalId}` : 'COM';
    return generarNumeroSecuencial(this.ds, 'compras', 'folio', '^COM-[0-9]+$', prefijo, 1, empresaId, tipo);
  }

  async create(dto: CreateCompraDto, usuario: User) {
    await this.proveedoresService.findOne(dto.proveedorId);

    const detallesData: Partial<CompraDetalle>[] = [];
    let subtotalCompra = 0;
    let itbisCompra = 0;

    const productoIds = dto.detalles.map(d => d.productoId);
    const productosMap = await this.productosService.findByIds(productoIds);

    for (const item of dto.detalles) {
      const producto = productosMap.get(item.productoId);
      if (!producto) throw new NotFoundException(`Producto #${item.productoId} no encontrado`);
      const porcentajeItbis = item.porcentajeItbis ?? ITBIS_DEFAULT;
      const subtotal = Number(item.precioUnitario) * item.cantidad;
      const importeItbis = Number((subtotal * (porcentajeItbis / 100)).toFixed(2));
      const total = Number((subtotal + importeItbis).toFixed(2));

      subtotalCompra += subtotal;
      itbisCompra += importeItbis;

      detallesData.push({
        productoId: item.productoId,
        descripcion: item.descripcion ?? producto.nombre,
        precioUnitario: item.precioUnitario,
        cantidad: item.cantidad,
        porcentajeItbis,
        subtotal,
        importeItbis,
        total,
      });
    }

    const folio      = await this.generarFolio();
    const empresaId  = this.tenantService.getEmpresaId();
    const sucursalId = await this.tenantService.resolveSucursalId((dto as any).sucursalId);

    const tipoPago    = dto.tipoPago ?? 'credito';
    const diasCredito = dto.diasCredito ?? 30;
    let fechaVencimiento: Date | undefined;
    if (tipoPago === 'credito') {
      fechaVencimiento = new Date(dto.fecha);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + diasCredito);
    }

    // Retenciones E41 (solo informales)
    const retieneItbis          = dto.retieneItbis ?? false;
    const pctItbis              = dto.porcentajeRetencionItbis ?? 30;
    const retieneIsr            = dto.retieneIsr ?? false;
    const pctIsr                = dto.porcentajeRetencionIsr ?? 10;
    const montoItbisTotal       = Number(itbisCompra.toFixed(2));
    const montoRetencionItbis   = retieneItbis ? Number((montoItbisTotal * pctItbis / 100).toFixed(2)) : 0;
    const montoRetencionIsr     = retieneIsr   ? Number((subtotalCompra * pctIsr / 100).toFixed(2)) : 0;
    const totalBruto            = Number((subtotalCompra + itbisCompra).toFixed(2));
    const netoPagar             = Number((totalBruto - montoRetencionItbis - montoRetencionIsr).toFixed(2));

    const almacenIdCtx = this.tenantService.getAlmacenId() ?? undefined;

    const compra = this.compraRepository.create({
      empresaId,
      folio,
      fecha:                  new Date(dto.fecha),
      proveedorId:            dto.proveedorId,
      usuarioId:              usuario.id,
      notas:                  dto.notas,
      numeroFacturaProveedor: dto.numeroFacturaProveedor,
      subtotal:               Number(subtotalCompra.toFixed(2)),
      itbis:                  montoItbisTotal,
      total:                  totalBruto,
      tipoPago,
      diasCredito,
      fechaVencimiento,
      moneda:                 dto.moneda ?? 'DOP',
      tipoCambio:             dto.tipoCambio ?? 1,
      retieneItbis,
      porcentajeRetencionItbis: pctItbis,
      montoRetencionItbis,
      retieneIsr,
      porcentajeRetencionIsr: pctIsr,
      montoRetencionIsr,
      netoPagar,
      almacenId:              dto.almacenId ?? almacenIdCtx,
      sucursalId,
    } as any);

    const savedCompra = (await this.compraRepository.save(compra as any)) as unknown as Compra;

    const detalles = this.detalleRepository.create(
      detallesData.map((d) => ({ ...d, compraId: savedCompra.id })),
    );
    await this.detalleRepository.save(detalles);

    this.realtimeService.notify(empresaId, 'compra', 'created', savedCompra.id);
    return this.findOne(savedCompra.id);
  }

  async findAll(pagination: PaginationDto & {
    estado?: string; desde?: string; hasta?: string; proveedorId?: number;
  }) {
    const empresaId  = this.tenantService.getEmpresaId();
    const sucursalId = this.tenantService.getSucursalId();
    const { limit = 10, page = 1, search, estado, desde, hasta, proveedorId } = pagination;

    const qb = this.compraRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.proveedor', 'proveedor')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('c.isActive = :active', { active: true });

    if (sucursalId) qb.andWhere('(c.sucursalId = :sucursalId OR c.sucursalId IS NULL)', { sucursalId });

    if (search) {
      qb.andWhere(
        '(c.folio ILIKE :s OR proveedor.nombre ILIKE :s OR proveedor.rnc ILIKE :s)',
        { s: `%${search}%` },
      );
    }
    if (estado)      qb.andWhere('c.estado = :estado',           { estado });
    if (proveedorId) qb.andWhere('c.proveedorId = :proveedorId', { proveedorId });
    if (desde)       qb.andWhere('c.fecha >= :desde',            { desde });
    if (hasta)       qb.andWhere('c.fecha <= :hasta',            { hasta });

    const [rawData, total] = await qb
      .orderBy('c.fecha', 'DESC')
      .addOrderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    // Enriquecer con e-CF (E41) emitido para cada compra
    const ids = rawData.map(c => c.id);
    let ecfMap: Record<number, { numero: string; estadoDGII: string }> = {};
    if (ids.length > 0) {
      const ecfs = await this.ds.query<{ documentoOrigenId: number; numero: string; estadoDGII: string }[]>(
        `SELECT "documentoOrigenId", numero, "estadoDGII"
         FROM ecf
         WHERE "documentoOrigenTipo" = 'COMPRA'
           AND "documentoOrigenId" = ANY($1::int[])
           AND "empresaId" = $2
           AND "isActive" = true
         ORDER BY id DESC`,
        [ids, empresaId],
      );
      for (const e of ecfs) {
        if (!ecfMap[e.documentoOrigenId]) ecfMap[e.documentoOrigenId] = e;
      }
    }

    const data = rawData.map(c => ({
      ...c,
      ecfNumero:  ecfMap[c.id]?.numero     ?? null,
      ecfEstado:  ecfMap[c.id]?.estadoDGII ?? null,
    }));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const compra = await this.compraRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['proveedor', 'usuario', 'detalles', 'detalles.producto'],
    });
    if (!compra) throw new NotFoundException(`Compra #${id} no encontrada`);
    return compra;
  }

  async cambiarEstado(id: number, estado: CompraEstado, notas?: string) {
    const compra = await this.findOne(id);

    const transiciones: Record<CompraEstado, CompraEstado[]> = {
      [CompraEstado.BORRADOR]: [CompraEstado.ENVIADA, CompraEstado.RECIBIDA, CompraEstado.CANCELADA],
      [CompraEstado.ENVIADA]:  [CompraEstado.RECIBIDA, CompraEstado.CANCELADA],
      [CompraEstado.RECIBIDA]: [CompraEstado.PAGADA, CompraEstado.CANCELADA],
      [CompraEstado.PAGADA]:   [],
      [CompraEstado.CANCELADA]: [],
    };

    if (!transiciones[compra.estado].includes(estado)) {
      throw new BadRequestException(
        `No se puede cambiar de "${compra.estado}" a "${estado}"`,
      );
    }

    if (estado === CompraEstado.RECIBIDA) {
      // 1. Registrar entrada en inventario — usar almacén de la compra o el del contexto
      const almacenIdCompra = (compra as any).almacenId ?? this.tenantService.getAlmacenId() ?? undefined;
      for (const detalle of compra.detalles) {
        await this.inventarioService.registrarEntrada(
          detalle.productoId,
          Number(detalle.cantidad),
          compra.usuarioId,
          `Compra recibida: ${compra.folio}`,
          compra.folio,
          almacenIdCompra,
        );
      }

      // 2. Crear cuenta por pagar solo si tipoPago = 'credito'
      if (!compra.tipoPago || compra.tipoPago === 'credito') {
        await this.cxpService.crear(compra.id, compra.usuarioId, compra.diasCredito ?? 30);
      }

      // 3. Asiento contable automático (con retenciones si aplica)
      await this.asientosService.asientoCompraRecibida(
        compra.id,
        Number(compra.total),
        Number(compra.subtotal),
        Number(compra.itbis),
        compra.folio,
        compra.usuarioId,
        compra.retieneItbis || compra.retieneIsr
          ? {
              montoItbis: Number(compra.montoRetencionItbis ?? 0),
              montoIsr:   Number(compra.montoRetencionIsr   ?? 0),
              netoPagar:  Number(compra.netoPagar           ?? compra.total),
            }
          : undefined,
      );
    }

    if (estado === CompraEstado.CANCELADA && compra.estado === CompraEstado.RECIBIDA) {
      const almacenIdCompra = (compra as any).almacenId ?? this.tenantService.getAlmacenId() ?? undefined;
      for (const detalle of compra.detalles) {
        await this.inventarioService.registrarDevolucion(
          detalle.productoId,
          Number(detalle.cantidad),
          compra.usuarioId,
          `Cancelación compra: ${compra.folio}`,
          compra.folio,
          almacenIdCompra,
        );
      }
    }

    const updatePayload: Partial<Compra> = { estado };
    if (notas !== undefined) updatePayload.notas = notas;
    await this.compraRepository.update(id, updatePayload);
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'compra', 'updated', id);
    return this.findOne(id);
  }

  async resumenPorEstado() {
    const empresaId = this.tenantService.getEmpresaId();
    return this.compraRepository
      .createQueryBuilder('c')
      .select('c.estado', 'estado')
      .addSelect('COUNT(c.id)', 'cantidad')
      .addSelect('SUM(c.subtotal)', 'subtotalTotal')
      .addSelect('SUM(c.itbis)', 'itbisTotal')
      .addSelect('SUM(c.total)', 'montoTotal')
      .where('c.empresaId = :empresaId', { empresaId })
      .andWhere('c.isActive = :active', { active: true })
      .groupBy('c.estado')
      .getRawMany();
  }

  async duplicar(id: number, userId: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const original  = await this.compraRepository.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['detalles'],
    });
    if (!original) throw new NotFoundException(`Compra #${id} no encontrada`);

    const folio = await this.generarFolio();

    const nueva = await this.compraRepository.save(
      this.compraRepository.create({
        empresaId,
        folio,
        fecha:       new Date(),
        estado:      CompraEstado.BORRADOR,
        proveedorId: original.proveedorId,
        usuarioId:   userId,
        subtotal:    original.subtotal,
        itbis:       original.itbis,
        total:       original.total,
        notas:       original.notas,
      } as any) as any,
    ) as unknown as Compra;

    if (original.detalles?.length) {
      await this.detalleRepository.save(
        original.detalles.map(d => ({
          compraId:        nueva.id,
          productoId:      d.productoId,
          descripcion:     d.descripcion,
          cantidad:        d.cantidad,
          precioUnitario:  d.precioUnitario,
          porcentajeItbis: d.porcentajeItbis,
          importeItbis:    d.importeItbis,
          subtotal:        d.subtotal,
          total:           d.total,
        })) as any,
      );
    }

    this.realtimeService.notify(empresaId, 'compra', 'created', nueva.id);

    return this.compraRepository.findOne({
      where: { id: nueva.id },
      relations: ['proveedor', 'detalles'],
    });
  }

  async remove(id: number) {
    const compra = await this.findOne(id);
    if (compra.estado !== CompraEstado.BORRADOR) {
      throw new BadRequestException('Solo se pueden eliminar compras en estado borrador');
    }
    await this.compraRepository.update(id, { isActive: false });
    this.realtimeService.notify(this.tenantService.getEmpresaId(), 'compra', 'deleted', id);
    return { message: `Compra ${compra.folio} eliminada` };
  }
}
