import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProForma, ProFormaEstado } from './entities/pro-forma.entity';
import { ProFormaItem } from './entities/pro-forma-item.entity';
import { TenantService } from '../tenant/tenant.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import type { DocumentoPDFData, DocumentoPDFItem } from '../common/pdf/documento-pdf.helper';
import { generarDocumentoPDFFactura } from '../common/pdf/documento-pdf.helper';
import {
  calcularTotalesConDescuento,
  validarInvarianteConvencionB,
  type LineaDescuentoInput,
} from '../common/calculo/descuento-documento';

interface ItemDto {
  productoId?: number;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  porcentajeIva?: number;
  // Descuento por línea — mismo contrato que factura y cotización
  descuentoPct?: number;
  descuentoMonto?: number;
  /** Presente ⇒ convención B (POS): precioUnitario ya viene neto */
  precioOriginal?: number;
}

interface CreateProFormaDto {
  clienteId?: number;
  sucursalId?: number;
  vendedorId?: number;
  notas?: string;
  validezDias?: number;
  detalles: ItemDto[];
  descuentoGeneralTipo?: string;
  descuentoGeneralValor?: number;
  descuentoGeneralFinal?: number;
}

@Injectable()
export class ProFormaService {
  private readonly logger = new Logger(ProFormaService.name);

  constructor(
    @InjectRepository(ProForma)     private pfRepo:   Repository<ProForma>,
    @InjectRepository(ProFormaItem) private itemRepo: Repository<ProFormaItem>,
    private tenantSvc: TenantService,
    @InjectDataSource() private ds: DataSource,
  ) {}

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [row] = await this.ds.query<{ numero: number }[]>(
      `SELECT siguiente_numero_secuencia($1, $2) AS numero`,
      [empresaId, 'PF'],
    );
    return `PF-${row.numero}`;
  }

  /**
   * Ítems y totales — vía única, la comparten crear() y actualizar().
   *
   * Delega en el mismo helper que facturas y cotizaciones. La pro-forma nombra
   * sus columnas distinto (`precio`, `porcentajeItbis`, `itbis`), pero la
   * aritmética del dinero tiene que ser la misma: una pro-forma se convierte en
   * factura y el total no puede moverse por el camino.
   */
  private calcularItems(dto: Pick<CreateProFormaDto,
    'detalles' | 'descuentoGeneralTipo' | 'descuentoGeneralValor'>) {
    const detalles = dto.detalles ?? [];

    const lineas: LineaDescuentoInput[] = detalles.map(d => {
      const linea: LineaDescuentoInput = {
        descripcion:    d.descripcion,
        cantidad:       Number(d.cantidad),
        precioUnitario: Number(d.precioUnitario),
        precioOriginal: d.precioOriginal ?? null,
        descuentoPct:   Number(d.descuentoPct   ?? 0),
        descuentoMonto: Number(d.descuentoMonto ?? 0),
        porcentajeIva:  d.porcentajeIva ?? 18,
      };
      validarInvarianteConvencionB(linea);
      return linea;
    });

    const totales = calcularTotalesConDescuento(lineas, {
      tipo:  dto.descuentoGeneralTipo,
      valor: dto.descuentoGeneralValor,
    });

    const itemsData = detalles.map((d, i) => ({
      ...d,
      pct:      d.porcentajeIva ?? 18,
      subtotal: totales.lineas[i].subtotal,
      itbis:    totales.lineas[i].importeIva,
      total:    totales.lineas[i].total,
    }));

    return { itemsData, subtotal: totales.subtotal, itbis: totales.iva, total: totales.total };
  }

  async crear(dto: CreateProFormaDto, usuarioId: number): Promise<ProForma> {
    const empresaId   = this.tenantSvc.getEmpresaId();
    const numero      = await this.generarNumero();
    const validezDias = dto.validezDias ?? 30;
    const fechaVenc   = new Date();
    fechaVenc.setDate(fechaVenc.getDate() + validezDias);

    const { itemsData, subtotal, itbis, total } = this.calcularItems(dto);

    const pf = this.pfRepo.create({
      empresaId,
      numero,
      clienteId:        dto.clienteId,
      sucursalId:       dto.sucursalId,
      vendedorId:       dto.vendedorId ?? usuarioId,
      subtotal,
      itbis,
      total,
      descuentoGeneralTipo:  dto.descuentoGeneralTipo ?? undefined,
      descuentoGeneralValor: Number(dto.descuentoGeneralValor ?? 0) > 0
        ? dto.descuentoGeneralValor
        : undefined,
      descuentoGeneralFinal: Number(dto.descuentoGeneralFinal ?? 0) > 0
        ? dto.descuentoGeneralFinal
        : undefined,
      notas:            dto.notas,
      validezDias,
      estado:           ProFormaEstado.ACTIVA,
      fechaEmision:     new Date(),
      fechaVencimiento: fechaVenc,
    });

    const saved = await this.pfRepo.save(pf);

    if (itemsData.length > 0) {
      await this.itemRepo.save(
        this.itemRepo.create(itemsData.map(i => ({
          empresaId,
          proFormaId:      saved.id,
          productoId:      i.productoId,
          descripcion:     i.descripcion,
          cantidad:        Number(i.cantidad),
          precio:          Number(i.precioUnitario),
          porcentajeItbis: i.pct,
          descuentoPct:    Number(i.descuentoPct   ?? 0),
          descuentoMonto:  Number(i.descuentoMonto ?? 0),
          precioOriginal:  i.precioOriginal ?? undefined,
          itbis:           i.itbis,
          subtotal:        i.subtotal,
        }))),
      );
    }

    this.logger.log(`Pro Forma ${numero} creada para empresa ${empresaId}`);
    return this.findOne(saved.id);
  }

  async listar(pagination: PaginationDto) {
    const empresaId  = this.tenantSvc.getEmpresaId();
    const sucursalId = this.tenantSvc.getSucursalId();
    const { limit = 20, page = 1, search } = pagination;

    // Actualizar VENCIDAS automáticamente
    await this.ds.query(
      `UPDATE pro_formas SET estado = 'VENCIDA'
       WHERE "empresaId" = $1 AND estado = 'ACTIVA' AND "fechaVencimiento" < NOW() AND "isActive" = true`,
      [empresaId],
    );

    const qb = this.pfRepo.createQueryBuilder('pf')
      .leftJoinAndSelect('pf.items', 'items')
      .where('pf.empresaId = :eid', { eid: empresaId })
      .andWhere('pf.isActive = true');

    // Filtrar por sucursal del JWT (igual que facturas): las sin sucursal son visibles a todas
    if (sucursalId) qb.andWhere('(pf.sucursalId = :sid OR pf.sucursalId IS NULL)', { sid: sucursalId });

    if (search) qb.andWhere('pf.numero ILIKE :s', { s: `%${search}%` });

    const [data, total] = await qb
      .orderBy('pf.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    // Enriquecer con nombre de cliente
    const clienteIds = [...new Set(data.map(p => p.clienteId).filter(Boolean))] as number[];
    let clienteMap: Record<number, string> = {};
    if (clienteIds.length > 0) {
      const rows = await this.ds.query<{ id: number; nombre: string }[]>(
        `SELECT id, nombre FROM clientes WHERE id = ANY($1)`,
        [clienteIds],
      );
      for (const r of rows) clienteMap[r.id] = r.nombre;
    }

    return {
      data: data.map(p => ({ ...p, clienteNombre: p.clienteId ? clienteMap[p.clienteId] ?? null : null })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number): Promise<any> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const pf = await this.pfRepo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['items'],
    });
    if (!pf) throw new NotFoundException(`Pro Forma #${id} no encontrada`);

    const extra: Record<string, string | null> = { clienteNombre: null, sucursalNombre: null };

    if (pf.clienteId) {
      const [cli] = await this.ds.query<{ nombre: string }[]>(
        `SELECT nombre FROM clientes WHERE id = $1 LIMIT 1`, [pf.clienteId],
      ).catch(() => []);
      if (cli) extra.clienteNombre = cli.nombre;
    }

    if (pf.sucursalId) {
      const [suc] = await this.ds.query<{ nombre: string }[]>(
        `SELECT nombre FROM sucursales WHERE id = $1 LIMIT 1`, [pf.sucursalId],
      ).catch(() => []);
      if (suc) extra.sucursalNombre = suc.nombre;
    }

    return Object.assign(pf, extra);
  }

  async actualizar(id: number, dto: CreateProFormaDto): Promise<any> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const pf = await this.findOne(id);

    const validezDias = dto.validezDias ?? pf.validezDias ?? 30;
    const fechaVenc = new Date();
    fechaVenc.setDate(fechaVenc.getDate() + validezDias);

    const { itemsData, subtotal, itbis, total } = this.calcularItems(dto);

    await this.pfRepo.update({ id }, {
      clienteId:        dto.clienteId  ?? pf.clienteId,
      sucursalId:       dto.sucursalId ?? pf.sucursalId,
      vendedorId:       dto.vendedorId ?? pf.vendedorId,
      notas:            dto.notas ?? pf.notas,
      validezDias,
      fechaVencimiento: fechaVenc,
      subtotal,
      itbis,
      total,
      // Si el usuario quita el descuento al editar, tiene que desaparecer
      descuentoGeneralTipo:  dto.descuentoGeneralTipo ?? null,
      descuentoGeneralValor: Number(dto.descuentoGeneralValor ?? 0) > 0
        ? dto.descuentoGeneralValor
        : null,
      descuentoGeneralFinal: Number(dto.descuentoGeneralFinal ?? 0) > 0
        ? dto.descuentoGeneralFinal
        : null,
    } as any);

    if (itemsData.length > 0) {
      await this.itemRepo.delete({ proFormaId: id } as any);
      await this.itemRepo.save(
        this.itemRepo.create(itemsData.map(i => ({
          empresaId,
          proFormaId:      id,
          productoId:      i.productoId,
          descripcion:     i.descripcion,
          cantidad:        Number(i.cantidad),
          precio:          Number(i.precioUnitario),
          porcentajeItbis: i.pct,
          descuentoPct:    Number(i.descuentoPct   ?? 0),
          descuentoMonto:  Number(i.descuentoMonto ?? 0),
          precioOriginal:  i.precioOriginal ?? undefined,
          itbis:           i.itbis,
          subtotal:        i.subtotal,
        }))),
      );
    }

    return this.findOne(id);
  }

  async eliminar(id: number): Promise<{ ok: boolean }> {
    await this.findOne(id);
    await this.pfRepo.update({ id }, { isActive: false } as any);
    return { ok: true };
  }

  async generarPDF(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const pf = await this.findOne(id);

    const empresa = await this.pfRepo.manager
      .query('SELECT * FROM empresa WHERE id = $1 LIMIT 1', [pf.empresaId])
      .then((r: any[]) => r[0] || {});

    let logoBuf: Buffer | undefined;
    if (empresa.logo) {
      try {
        const res = await fetch(empresa.logo, { signal: AbortSignal.timeout(5_000) });
        if (res.ok) logoBuf = Buffer.from(await res.arrayBuffer());
      } catch { /* sin logo */ }
    }

    let clienteNombre = 'Consumidor Final';
    let clienteRNC: string | undefined;
    if (pf.clienteId) {
      const [cli] = await this.ds.query<{ nombre: string; rncReceptor?: string }[]>(
        `SELECT nombre, "rncReceptor" FROM clientes WHERE id = $1 LIMIT 1`, [pf.clienteId],
      ).catch(() => []);
      if (cli) { clienteNombre = cli.nombre; clienteRNC = cli.rncReceptor; }
    }

    // Las filas van POST descuento de línea y PRE descuento general; el general
    // baja a su propia fila en los totales — igual que factura y cotización.
    const lineasPdf: LineaDescuentoInput[] = pf.items.map(i => ({
      descripcion:    i.descripcion,
      cantidad:       Number(i.cantidad),
      precioUnitario: Number(i.precio),
      precioOriginal: i.precioOriginal ?? null,
      descuentoPct:   Number(i.descuentoPct   ?? 0),
      descuentoMonto: Number(i.descuentoMonto ?? 0),
      porcentajeIva:  Number(i.porcentajeItbis),
    }));
    const preGeneral = calcularTotalesConDescuento(lineasPdf);
    const conGeneral = calcularTotalesConDescuento(lineasPdf, {
      tipo:  (pf as any).descuentoGeneralTipo,
      valor: (pf as any).descuentoGeneralValor,
    });

    const items: DocumentoPDFItem[] = pf.items.map((i, k) => ({
      descripcion:    i.descripcion,
      cantidad:       Number(i.cantidad),
      unidadMedida:   'UN',
      precioUnitario: Number(i.precio),
      precioOriginal: i.precioOriginal != null ? Number(i.precioOriginal) : undefined,
      descuentoLinea: preGeneral.lineas[k].descuentoLinea,
      descuentoPct:   Number(i.descuentoPct ?? 0),
      itbisPct:       Number(i.porcentajeItbis),
      importeItbis:   preGeneral.lineas[k].importeIva,
      subtotal:       preGeneral.lineas[k].subtotal,
      total:          preGeneral.lineas[k].total,
    }));

    const subtotalGravado = items.filter(i => i.itbisPct > 0).reduce((s, i) => s + i.subtotal, 0);
    const subtotalExento  = items.filter(i => i.itbisPct === 0).reduce((s, i) => s + i.subtotal, 0);

    const fechaVencStr = pf.fechaVencimiento
      ? new Date(pf.fechaVencimiento).toISOString().substring(0, 10)
      : undefined;

    const data: DocumentoPDFData = {
      tipo:             'PRO FORMA',
      tipoSub:          'Presupuesto informativo · No válido como comprobante fiscal · Sin NCF',
      numero:           pf.numero,
      fecha:            new Date(pf.fechaEmision).toISOString().substring(0, 10),
      fechaVencimiento: fechaVencStr,
      validezDias:      pf.validezDias,
      estado:           pf.estado,
      estadoColor:      pf.estado === ProFormaEstado.VENCIDA ? 'red' : 'blue',
      empresaNombre:    empresa.nombreComercial || empresa.nombre || 'Mi Empresa',
      empresaRNC:       empresa.rnc || '',
      empresaDireccion: empresa.direccion || '',
      empresaTelefono:  empresa.telefono,
      empresaEmail:     empresa.email,
      clienteNombre,
      clienteRNC,
      items,
      descuentoTotal:        conGeneral.descuentoGeneral,
      descuentoGeneralTipo:  (pf as any).descuentoGeneralTipo,
      descuentoGeneralValor: (pf as any).descuentoGeneralValor != null
        ? Number((pf as any).descuentoGeneralValor) : undefined,
      descuentoGeneralFinal: (pf as any).descuentoGeneralFinal != null
        ? Number((pf as any).descuentoGeneralFinal) : undefined,
      subtotalGravado,
      subtotalExento,
      subtotalGeneral:  subtotalGravado + subtotalExento,
      itbisTotal:       Number(pf.itbis),
      totalGeneral:     Number(pf.total),
      notas:            pf.notas ?? undefined,
      mostrarFirma:     false,
    };

    const buffer = await generarDocumentoPDFFactura(data, logoBuf);
    return { buffer, filename: `${pf.numero}.pdf` };
  }
}
