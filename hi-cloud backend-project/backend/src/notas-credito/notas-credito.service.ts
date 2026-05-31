import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { NotaCredito, EstadoNotaCredito, MotivoNotaCredito } from './entities/nota-credito.entity';
import { NotaCreditoDetalle } from './entities/nota-credito-detalle.entity';
import { TenantService } from '../tenant/tenant.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';

interface DetalleDto {
  productoId?:    number;
  descripcion:    string;
  unidadMedida?:  string;
  cantidad:       number;
  precioUnitario: number;
  porcentajeIva?: number;
}

interface CreateNotaCreditoDto {
  clienteId:          number;
  fecha:              string;
  tipoNcf?:           string;
  facturaOriginalId?: number;
  facturaOriginalFolio?: string;
  motivo?:            string;
  descripcionMotivo?: string;
  notas?:             string;
  vendedorId?:        number;
  nombreVendedor?:    string;
  detalles:           DetalleDto[];
  moneda?:            string;
  tipoCambio?:        number;
}

@Injectable()
export class NotasCreditoService {
  constructor(
    @InjectRepository(NotaCredito)        private ncRepo:     Repository<NotaCredito>,
    @InjectRepository(NotaCreditoDetalle) private detRepo:    Repository<NotaCreditoDetalle>,
    private tenantSvc: TenantService,
    @InjectDataSource() private ds: DataSource,
  ) {}

  // ─── Folio (atómico con SELECT FOR UPDATE) ────────────────────────────────────

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    return generarNumeroSecuencial(this.ds, 'notas_credito', 'numero', '^NC-[0-9]+$', 'NC-', 1, empresaId);
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────────

  async getSaldoDisponible(facturaId: number): Promise<{
    totalFactura: number; ncEmitidas: number; saldoDisponible: number; moneda: string;
  }> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const [factura] = await this.ds.query<any[]>(
      `SELECT total::numeric, COALESCE(moneda,'DOP') AS moneda
       FROM facturas WHERE id = $1 AND "empresaId" = $2 AND "isActive" = true`,
      [facturaId, empresaId],
    );
    if (!factura) throw new NotFoundException(`Factura #${facturaId} no encontrada`);
    const [{ ncEmitidas }] = await this.ds.query<{ ncEmitidas: string }[]>(
      `SELECT COALESCE(SUM(total), 0)::numeric AS "ncEmitidas"
       FROM notas_credito
       WHERE "facturaOriginalId" = $1 AND "empresaId" = $2
         AND estado != 'anulada' AND "isActive" = true`,
      [facturaId, empresaId],
    );
    const totalFactura    = +Number(factura.total).toFixed(2);
    const ncEmitidasNum   = +Number(ncEmitidas).toFixed(2);
    const saldoDisponible = +Math.max(totalFactura - ncEmitidasNum, 0).toFixed(2);
    return { totalFactura, ncEmitidas: ncEmitidasNum, saldoDisponible, moneda: factura.moneda };
  }

  async crear(dto: CreateNotaCreditoDto, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero    = await this.generarNumero();

    const detalles = dto.detalles.map(d => {
      const pctIva   = d.porcentajeIva ?? 18;
      const subtotal = +(d.cantidad * d.precioUnitario).toFixed(2);
      const iva      = +(subtotal * pctIva / 100).toFixed(2);
      return { ...d, unidadMedida: d.unidadMedida ?? 'PZA', porcentajeIva: pctIva, subtotal, iva, total: +(subtotal + iva).toFixed(2) };
    });

    const subtotal = detalles.reduce((s, d) => s + d.subtotal, 0);
    const iva      = detalles.reduce((s, d) => s + d.iva,      0);
    const totalNC  = +(subtotal + iva).toFixed(2);

    // Validar saldo disponible cuando referencia una factura
    if (dto.facturaOriginalId) {
      const saldo = await this.getSaldoDisponible(dto.facturaOriginalId);
      if (totalNC > saldo.saldoDisponible + 0.005) {
        throw new BadRequestException(
          `El monto de la NC (${totalNC.toFixed(2)} ${saldo.moneda}) excede el saldo disponible ` +
          `de la factura (${saldo.saldoDisponible.toFixed(2)} ${saldo.moneda}). ` +
          `Ya existen NC activas por ${saldo.ncEmitidas.toFixed(2)}.`,
        );
      }
    }

    const nc = this.ncRepo.create({
      empresaId,
      numero,
      fecha:                  dto.fecha as unknown as Date,
      tipoNcf:                dto.tipoNcf ?? 'E34',
      facturaOriginalId:      dto.facturaOriginalId,
      facturaOriginalFolio:   dto.facturaOriginalFolio,
      clienteId:              dto.clienteId,
      usuarioId,
      motivo:                 (dto.motivo ?? MotivoNotaCredito.DEVOLUCION) as any,
      descripcionMotivo:      dto.descripcionMotivo,
      notas:                  dto.notas,
      moneda:                 dto.moneda ?? 'DOP',
      tipoCambio:             dto.tipoCambio ?? 1,
      vendedorId:             dto.vendedorId,
      nombreVendedor:         dto.nombreVendedor,
      subtotal:               +subtotal.toFixed(2),
      iva:                    +iva.toFixed(2),
      total:                  +(subtotal + iva).toFixed(2),
      detalles:               detalles as unknown as NotaCreditoDetalle[],
    });

    return this.ncRepo.save(nc);
  }

  async listar(pagination: PaginationDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const { limit = 10, page = 1, search } = pagination;

    const qb = this.ncRepo
      .createQueryBuilder('nc')
      .leftJoinAndSelect('nc.cliente',  'c')
      .leftJoinAndSelect('nc.detalles', 'd')
      .where('nc.empresaId = :eid', { eid: empresaId })
      .andWhere('nc.isActive = :a',  { a: true });

    if (search) qb.andWhere('(nc.numero ILIKE :s OR c.nombre ILIKE :s)', { s: `%${search}%` });

    const [data, total] = await qb
      .orderBy('nc.createdAt', 'DESC')
      .addOrderBy('d.id', 'ASC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    // Enriquecer con datos ECF (número y estado) para que el frontend
    // pueda ocultar el botón "e-CF E34" cuando ya fue emitido
    const ids = data.map(n => n.id);
    let ecfByNotaId: Record<number, { numero: string; estadoDGII: string }> = {};
    if (ids.length > 0) {
      const ecfRows = await this.ncRepo.manager.query<any[]>(
        `SELECT DISTINCT ON ("documentoOrigenId")
           "documentoOrigenId" AS "notaId", numero, "estadoDGII"
         FROM ecf
         WHERE "documentoOrigenId" = ANY($1)
           AND "documentoOrigenTipo" = 'NOTA_CREDITO'
         ORDER BY "documentoOrigenId", "createdAt" DESC`,
        [ids],
      );
      for (const e of ecfRows) {
        ecfByNotaId[e.notaId] = { numero: e.numero, estadoDGII: e.estadoDGII };
      }
    }

    const enriched = data.map(n => ({
      ...n,
      ecfNumero: ecfByNotaId[n.id]?.numero ?? null,
      ecf:       ecfByNotaId[n.id] ?? null,
    }));

    return { data: enriched, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const nc = await this.ncRepo.findOne({
      where:     { id, empresaId, isActive: true },
      relations: ['cliente', 'detalles'],
    });
    if (!nc) throw new NotFoundException(`Nota de Crédito #${id} no encontrada`);
    return nc;
  }

  // ─── Ciclo de vida ────────────────────────────────────────────────────────────

  async emitir(id: number) {
    const nc = await this.findOne(id);
    if (nc.estado !== EstadoNotaCredito.BORRADOR) {
      throw new BadRequestException('Solo se puede emitir notas en BORRADOR');
    }
    await this.ncRepo.update(id, { estado: EstadoNotaCredito.EMITIDA });
    return this.findOne(id);
  }

  async anular(id: number) {
    const nc = await this.findOne(id);
    if (nc.estado === EstadoNotaCredito.ANULADA) {
      throw new BadRequestException('La nota ya está anulada');
    }
    await this.ncRepo.update(id, { estado: EstadoNotaCredito.ANULADA });
    return this.findOne(id);
  }

  async eliminar(id: number) {
    const nc = await this.findOne(id);
    if (nc.estado !== EstadoNotaCredito.BORRADOR) {
      throw new BadRequestException('Solo se pueden eliminar notas en BORRADOR');
    }
    await this.ncRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ─── Por factura ──────────────────────────────────────────────────────────────

  async porFactura(facturaId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.ncRepo.find({
      where: { empresaId, facturaOriginalId: facturaId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Resumen ─────────────────────────────────────────────────────────────────

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const raw = await this.ncRepo
      .createQueryBuilder('nc')
      .select('nc.estado', 'estado')
      .addSelect('COUNT(nc.id)', 'cantidad')
      .addSelect('COALESCE(SUM(nc.total), 0)', 'total')
      .where('nc.empresaId = :eid', { eid: empresaId })
      .andWhere('nc.isActive = :a', { a: true })
      .groupBy('nc.estado')
      .getRawMany<{ estado: string; cantidad: string; total: string }>();

    return raw.map(r => ({
      estado:   r.estado,
      cantidad: Number(r.cantidad),
      total:    Number(r.total),
    }));
  }
}
