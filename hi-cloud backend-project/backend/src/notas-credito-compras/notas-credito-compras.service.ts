import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { NotaCreditoCompra, EstadoNCCompra, MotivoNCCompra, TipoNCCompra } from './entities/nota-credito-compra.entity';
import { NotaCreditoCompraDetalle } from './entities/nota-credito-compra-detalle.entity';
import { Producto } from '../productos/entities/producto.entity';
import { Compra } from '../compras/entities/compra.entity';
import { CompraDetalle } from '../compras/entities/compra-detalle.entity';
import { TenantService } from '../tenant/tenant.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { AsientosAutomaticosService } from '../contabilidad/services/asientos-automaticos.service';
import { TipoOrigenAsiento } from '../contabilidad/entities/asiento-contable.entity';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

interface DetalleDto {
  productoId?:      number;
  compraDetalleId?: number;
  descripcion:      string;
  unidadMedida?:    string;
  cantidad:         number;
  precioUnitario:   number;
  porcentajeIva?:   number;
}

interface CreateNCCDto {
  proveedorId:          number;
  fecha:                string;
  tipo:                 TipoNCCompra;
  compraOriginalId?:    number;
  compraOriginalFolio?: string;
  ncfProveedor:         string;
  motivo:               MotivoNCCompra;
  descripcionMotivo?:   string;
  notas?:               string;
  detalles:             DetalleDto[];
}

@Injectable()
export class NotasCreditoComprasService {
  constructor(
    @InjectRepository(NotaCreditoCompra)        private nccRepo:   Repository<NotaCreditoCompra>,
    @InjectRepository(NotaCreditoCompraDetalle) private detRepo:   Repository<NotaCreditoCompraDetalle>,
    @InjectRepository(Producto)                 private prodRepo:  Repository<Producto>,
    @InjectRepository(Compra)                   private compraRepo: Repository<Compra>,
    @InjectRepository(CompraDetalle)            private compraDetRepo: Repository<CompraDetalle>,
    private dataSource:  DataSource,
    private tenantSvc:   TenantService,
    private asientosService: AsientosAutomaticosService,
  ) {}

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    return generarNumeroSecuencial(
      this.dataSource, 'notas_credito_compras', 'numero', '^NCC-[0-9]+$', 'NCC-', 1, empresaId,
    );
  }

  /**
   * Valida cantidad contra la línea de compra_detalles referenciada —
   * solo para líneas que SÍ traen compraDetalleId (una NC puede tener
   * líneas sin vínculo a una OC puntual, sobre todo en ajuste_sin_devolucion).
   *
   * devolucion_inventario: no se puede devolver más de lo que esa línea
   *   efectivamente recibió (no lo que se ordenó — una OC con recepción
   *   parcial no puede "devolver" lo que nunca llegó).
   * no_recibida: no se puede anular más de lo que esa línea tiene pendiente
   *   de recibir (cantidadTotal - cantidadRecibida).
   * ajuste_sin_devolucion: sin tope — es un ajuste de valor, no de cantidad
   *   física.
   */
  private async validarCantidadesContraCompra(tipo: TipoNCCompra, detalles: DetalleDto[]): Promise<void> {
    if (tipo === TipoNCCompra.AJUSTE_SIN_DEVOLUCION) return;

    const idsConVinculo = detalles.filter(d => d.compraDetalleId).map(d => d.compraDetalleId!);
    if (idsConVinculo.length === 0) return;

    const lineas = await this.compraDetRepo.findBy({ id: In(idsConVinculo) });
    const porId = new Map(lineas.map(l => [l.id, l]));

    for (const d of detalles) {
      if (!d.compraDetalleId) continue;
      const linea = porId.get(d.compraDetalleId);
      if (!linea) throw new BadRequestException(`Línea de compra #${d.compraDetalleId} no encontrada`);

      const cantidadTotal   = Number((linea as any).cantidadTotal ?? linea.cantidad);
      const cantidadRecibida = Number((linea as any).cantidadRecibida ?? 0);

      if (tipo === TipoNCCompra.DEVOLUCION_INVENTARIO && d.cantidad > cantidadRecibida) {
        throw new BadRequestException(
          `"${d.descripcion}": no se puede devolver ${d.cantidad} — solo se recibieron ${cantidadRecibida} de esa línea`,
        );
      }
      if (tipo === TipoNCCompra.NO_RECIBIDA) {
        const pendiente = +(cantidadTotal - cantidadRecibida).toFixed(4);
        if (d.cantidad > pendiente) {
          throw new BadRequestException(
            `"${d.descripcion}": no se puede anular ${d.cantidad} — solo hay ${pendiente} pendiente de recibir en esa línea`,
          );
        }
      }
    }
  }

  async crear(dto: CreateNCCDto, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero    = await this.generarNumero();

    await this.validarCantidadesContraCompra(dto.tipo, dto.detalles);

    const detalles = dto.detalles.map(d => {
      const pct  = d.porcentajeIva ?? 18;
      const sub  = +(d.cantidad * d.precioUnitario).toFixed(2);
      const iva  = +(sub * pct / 100).toFixed(2);
      return { ...d, unidadMedida: d.unidadMedida ?? 'PZA', porcentajeIva: pct, subtotal: sub, iva, total: +(sub + iva).toFixed(2) };
    });

    const subtotal = detalles.reduce((s, d) => s + d.subtotal, 0);
    const iva      = detalles.reduce((s, d) => s + d.iva, 0);

    const ncc = this.nccRepo.create({
      empresaId,
      numero,
      fecha:                dto.fecha as unknown as Date,
      proveedorId:          dto.proveedorId,
      tipo:                 dto.tipo,
      compraOriginalId:     dto.compraOriginalId,
      compraOriginalFolio:  dto.compraOriginalFolio,
      ncfProveedor:         dto.ncfProveedor,
      motivo:               dto.motivo,
      descripcionMotivo:    dto.descripcionMotivo,
      notas:                dto.notas,
      usuarioId,
      subtotal:             +subtotal.toFixed(2),
      iva:                  +iva.toFixed(2),
      total:                +(subtotal + iva).toFixed(2),
      detalles:             detalles as unknown as NotaCreditoCompraDetalle[],
    });

    return this.nccRepo.save(ncc);
  }

  async listar(pagination: PaginationDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const { limit = 10, page = 1, search } = pagination;
    const qb = this.nccRepo
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.proveedor', 'p')
      .leftJoinAndSelect('n.compraOriginal', 'co')
      .where('n.empresaId = :eid', { eid: empresaId })
      .andWhere('n.isActive = :a', { a: true });
    if (search) qb.andWhere('(n.numero ILIKE :s OR p.nombre ILIKE :s)', { s: `%${search}%` });
    const [data, total] = await qb
      .orderBy('n.createdAt', 'DESC')
      .skip((page - 1) * limit).take(Math.min(limit, 100))
      .getManyAndCount();
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const n = await this.nccRepo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['compraOriginal'],
    });
    if (!n) throw new NotFoundException(`Nota de Crédito Compra #${id} no encontrada`);
    return n;
  }

  async recibir(id: number) {
    const ncc = await this.findOne(id);
    if (ncc.estado !== EstadoNCCompra.BORRADOR) {
      throw new BadRequestException('Solo se puede confirmar notas en BORRADOR');
    }

    // Solo devolucion_inventario mueve stock físico: es la única de las tres
    // donde mercancía que SÍ entró vuelve a salir. ajuste_sin_devolucion no
    // hubo devolución física; no_recibida nunca llegó a entrar — no hay nada
    // que sacar del inventario físico en ninguna de las dos.
    if (ncc.tipo === TipoNCCompra.DEVOLUCION_INVENTARIO) {
      await this.dataSource.transaction(async em => {
        const prodRepo = em.getRepository(Producto);
        for (const det of ncc.detalles) {
          if (det.productoId) {
            const prod = await prodRepo.findOne({ where: { id: det.productoId } });
            if (prod) {
              const nuevoStock = Math.max(0, Number(prod.stock) - Number(det.cantidad));
              await prodRepo.update(det.productoId, { stock: nuevoStock });
            }
          }
        }
        await em.getRepository(NotaCreditoCompra).update(id, { estado: EstadoNCCompra.RECIBIDA });
      });
    } else {
      await this.nccRepo.update(id, { estado: EstadoNCCompra.RECIBIDA });
    }

    // devolucion_inventario / no_recibida: se acredita la MISMA cuenta que la
    // compra original debitó (Inventario por default, o la que el contador
    // haya fijado en Compra.cuentaDestino — gasto/activo fijo). En ambos
    // casos se está corrigiendo ese mismo compromiso, con o sin movimiento
    // físico. ajuste_sin_devolucion no reversa esa cuenta — la mercancía
    // (si entró) se queda en inventario; lo que se acredita es Costo de
    // Ventas, porque el ajuste es de VALOR, no de existencia.
    let cuentaDestinoOriginal: string | undefined;
    if (ncc.compraOriginalId && ncc.tipo !== TipoNCCompra.AJUSTE_SIN_DEVOLUCION) {
      const compraOriginal = await this.compraRepo.findOne({ where: { id: ncc.compraOriginalId } });
      cuentaDestinoOriginal = (compraOriginal as any)?.cuentaDestino || undefined;
    }

    await this.asientosService.asientoNotaCreditoCompra(
      ncc.id, Number(ncc.total), Number(ncc.subtotal), Number(ncc.iva), ncc.numero,
      ncc.fecha as unknown as string, ncc.usuarioId,
      { cuentaDestinoOriginal, sinInventario: ncc.tipo === TipoNCCompra.AJUSTE_SIN_DEVOLUCION },
    );

    return this.findOne(id);
  }

  async anular(id: number) {
    const ncc = await this.findOne(id);
    if (ncc.estado === EstadoNCCompra.ANULADA) throw new BadRequestException('Ya está anulada');
    await this.nccRepo.update(id, { estado: EstadoNCCompra.ANULADA });

    // Reversa contable: si la NCC ya estaba RECIBIDA y tenía su propio
    // asiento, lo revierte. Si seguía en BORRADOR (nunca se generó),
    // revertirAsiento no encuentra nada, lo reporta a Sentry y no rompe.
    await this.asientosService.revertirAsiento(
      TipoOrigenAsiento.NOTA_CREDITO_COMPRA,
      id,
      fechaHoyRD(),
      `Anulación de nota de crédito de compra ${ncc.numero}`,
    );

    return this.findOne(id);
  }

  async eliminar(id: number) {
    const ncc = await this.findOne(id);
    if (ncc.estado !== EstadoNCCompra.BORRADOR) throw new BadRequestException('Solo se pueden eliminar notas en BORRADOR');
    await this.nccRepo.update(id, { isActive: false });
    return { ok: true };
  }

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const raw = await this.nccRepo
      .createQueryBuilder('n')
      .select('n.estado', 'estado')
      .addSelect('COUNT(n.id)', 'cantidad')
      .addSelect('COALESCE(SUM(n.total), 0)', 'total')
      .where('n.empresaId = :eid', { eid: empresaId })
      .andWhere('n.isActive = :a', { a: true })
      .groupBy('n.estado')
      .getRawMany<{ estado: string; cantidad: string; total: string }>();
    return raw.map(r => ({ estado: r.estado, cantidad: Number(r.cantidad), total: Number(r.total) }));
  }
}
