import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProForma, ProFormaEstado } from './entities/pro-forma.entity';
import { ProFormaItem } from './entities/pro-forma-item.entity';
import { TenantService } from '../tenant/tenant.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import type { DocumentoPDFData, DocumentoPDFItem } from '../common/pdf/documento-pdf.helper';
import { generarDocumentoPDFFactura } from '../common/pdf/documento-pdf.helper';

interface ItemDto {
  productoId?: number;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  porcentajeIva?: number;
}

interface CreateProFormaDto {
  clienteId?: number;
  sucursalId?: number;
  vendedorId?: number;
  notas?: string;
  validezDias?: number;
  detalles: ItemDto[];
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

  async crear(dto: CreateProFormaDto, usuarioId: number): Promise<ProForma> {
    const empresaId   = this.tenantSvc.getEmpresaId();
    const numero      = await this.generarNumero();
    const validezDias = dto.validezDias ?? 30;
    const fechaVenc   = new Date();
    fechaVenc.setDate(fechaVenc.getDate() + validezDias);

    const itemsData = (dto.detalles ?? []).map(d => {
      const pct      = d.porcentajeIva ?? 18;
      const subtotal = +(Number(d.cantidad) * Number(d.precioUnitario)).toFixed(2);
      const itbis    = +(subtotal * pct / 100).toFixed(2);
      return { pct, subtotal, itbis, ...d };
    });

    const subtotal = itemsData.reduce((s, i) => s + i.subtotal, 0);
    const itbis    = itemsData.reduce((s, i) => s + i.itbis,    0);
    const total    = +(subtotal + itbis).toFixed(2);

    const pf = this.pfRepo.create({
      empresaId,
      numero,
      clienteId:        dto.clienteId,
      sucursalId:       dto.sucursalId,
      vendedorId:       dto.vendedorId ?? usuarioId,
      subtotal:         +subtotal.toFixed(2),
      itbis:            +itbis.toFixed(2),
      total,
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
          itbis:           i.itbis,
          subtotal:        i.subtotal,
        }))),
      );
    }

    this.logger.log(`Pro Forma ${numero} creada para empresa ${empresaId}`);
    return this.findOne(saved.id);
  }

  async listar(pagination: PaginationDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
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

  async findOne(id: number): Promise<ProForma> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const pf = await this.pfRepo.findOne({
      where: { id, empresaId, isActive: true },
      relations: ['items'],
    });
    if (!pf) throw new NotFoundException(`Pro Forma #${id} no encontrada`);
    return pf;
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

    const items: DocumentoPDFItem[] = pf.items.map(i => {
      const subtotal = Number(i.subtotal);
      return {
        descripcion:    i.descripcion,
        cantidad:       Number(i.cantidad),
        unidadMedida:   'UN',
        precioUnitario: Number(i.precio),
        itbisPct:       Number(i.porcentajeItbis),
        importeItbis:   Number(i.itbis),
        subtotal,
        total:          subtotal + Number(i.itbis),
      };
    });

    const subtotalGravado = items.filter(i => i.itbisPct > 0).reduce((s, i) => s + i.subtotal, 0);
    const subtotalExento  = items.filter(i => i.itbisPct === 0).reduce((s, i) => s + i.subtotal, 0);

    const fechaVencStr = pf.fechaVencimiento
      ? String(pf.fechaVencimiento).substring(0, 10)
      : undefined;

    const data: DocumentoPDFData = {
      tipo:             'PRO FORMA',
      tipoSub:          'Presupuesto informativo · No válido como comprobante fiscal · Sin NCF',
      numero:           pf.numero,
      fecha:            String(pf.fechaEmision).substring(0, 10),
      fechaVencimiento: fechaVencStr,
      validezDias:      pf.validezDias,
      estado:           pf.estado,
      estadoColor:      pf.estado === ProFormaEstado.VENCIDA ? 'red' : 'blue',
      empresaNombre:    empresa.razonSocial || empresa.nombre || 'Mi Empresa',
      empresaRNC:       empresa.rnc || '',
      empresaDireccion: empresa.direccion || '',
      empresaTelefono:  empresa.telefono,
      empresaEmail:     empresa.email,
      clienteNombre,
      clienteRNC,
      items,
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
