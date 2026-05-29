import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { generarNumeroSecuencial } from '../common/utils/generar-numero.util';
import { NotaDebito, EstadoNotaDebito } from './entities/nota-debito.entity';
import { NotaDebitoDetalle } from './entities/nota-debito-detalle.entity';
import { TenantService } from '../tenant/tenant.service';
import { PaginationDto } from '../common/dto/pagination.dto';

interface DetalleDto {
  productoId?:    number;
  descripcion:    string;
  unidadMedida?:  string;
  cantidad:       number;
  precioUnitario: number;
  porcentajeIva?: number;
}

interface CreateNDDto {
  clienteId:            number;
  fecha:                string;
  facturaOriginalId?:   number;
  facturaOriginalFolio?: string;
  motivo:               string;
  descripcionMotivo?:   string;
  notas?:               string;
  vendedorId?:          number;
  nombreVendedor?:      string;
  detalles:             DetalleDto[];
}

@Injectable()
export class NotasDebitoService {
  constructor(
    @InjectRepository(NotaDebito)        private ndRepo:  Repository<NotaDebito>,
    @InjectRepository(NotaDebitoDetalle) private detRepo: Repository<NotaDebitoDetalle>,
    private tenantSvc: TenantService,
    @InjectDataSource() private ds: DataSource,
  ) {}

  // ─── Folio ────────────────────────────────────────────────────────────────────

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    return generarNumeroSecuencial(
      this.ds, 'notas_debito', 'numero', '^ND-[0-9]+$', 'ND-', 1, empresaId,
    );
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────────

  async crear(dto: CreateNDDto, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();

    // E33 (Nota Débito) solo puede referenciar e-CFs tipo E31 según normativa DGII
    if (dto.facturaOriginalId) {
      const [ecfOriginal] = await this.ds.query<any[]>(
        `SELECT t.codigo FROM ecf e
         JOIN tipos_ecf t ON t.id = e."tipoECFId"
         WHERE e."facturaId" = $1 AND e."empresaId" = $2
           AND e."estadoDGII" = 'aceptado' AND e."isActive" = true
         ORDER BY e."createdAt" DESC LIMIT 1`,
        [dto.facturaOriginalId, empresaId],
      );
      if (ecfOriginal && ecfOriginal.codigo !== 'E31') {
        throw new BadRequestException(
          `Una Nota de Débito (E33) solo puede referenciar un e-CF tipo E31. ` +
          `El documento seleccionado es tipo ${ecfOriginal.codigo}.`,
        );
      }
    }

    const numero = await this.generarNumero();

    const detalles = dto.detalles.map(d => {
      const pctIva   = d.porcentajeIva ?? 18;
      const subtotal = +(d.cantidad * d.precioUnitario).toFixed(2);
      const iva      = +(subtotal * pctIva / 100).toFixed(2);
      return { ...d, unidadMedida: d.unidadMedida ?? 'PZA', porcentajeIva: pctIva, subtotal, iva, total: +(subtotal + iva).toFixed(2) };
    });

    const subtotal = detalles.reduce((s, d) => s + d.subtotal, 0);
    const iva      = detalles.reduce((s, d) => s + d.iva, 0);

    const nd = this.ndRepo.create({
      empresaId,
      numero,
      fecha:                dto.fecha as unknown as Date,
      tipoNcf:              'E33',
      facturaOriginalId:    dto.facturaOriginalId,
      facturaOriginalFolio: dto.facturaOriginalFolio,
      clienteId:            dto.clienteId,
      usuarioId,
      motivo:               dto.motivo as any,
      descripcionMotivo:    dto.descripcionMotivo,
      notas:                dto.notas,
      vendedorId:           dto.vendedorId,
      nombreVendedor:       dto.nombreVendedor,
      subtotal:             +subtotal.toFixed(2),
      iva:                  +iva.toFixed(2),
      total:                +(subtotal + iva).toFixed(2),
      detalles:             detalles as unknown as NotaDebitoDetalle[],
    });

    return this.ndRepo.save(nd);
  }

  async listar(pagination: PaginationDto) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const { limit = 10, page = 1, search } = pagination;

    const qb = this.ndRepo
      .createQueryBuilder('nd')
      .leftJoinAndSelect('nd.cliente',  'c')
      .leftJoinAndSelect('nd.detalles', 'd')
      .where('nd.empresaId = :eid', { eid: empresaId })
      .andWhere('nd.isActive = :a',  { a: true });

    if (search) qb.andWhere('(nd.numero ILIKE :s OR c.nombre ILIKE :s)', { s: `%${search}%` });

    const [data, total] = await qb
      .orderBy('nd.createdAt', 'DESC')
      .addOrderBy('d.id', 'ASC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    // Enriquecer con datos ECF para ocultar botón "e-CF E33" cuando ya fue emitido
    const ids = data.map(n => n.id);
    let ecfByNotaId: Record<number, { numero: string; estadoDGII: string }> = {};
    if (ids.length > 0) {
      const ecfRows = await this.ndRepo.manager.query<any[]>(
        `SELECT DISTINCT ON ("documentoOrigenId")
           "documentoOrigenId" AS "notaId", numero, "estadoDGII"
         FROM ecf
         WHERE "documentoOrigenId" = ANY($1)
           AND "documentoOrigenTipo" = 'NOTA_DEBITO'
         ORDER BY "documentoOrigenId", "createdAt" DESC`,
        [ids],
      );
      for (const e of ecfRows) { ecfByNotaId[e.notaId] = { numero: e.numero, estadoDGII: e.estadoDGII }; }
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
    const nd = await this.ndRepo.findOne({
      where:     { id, empresaId, isActive: true },
      relations: ['cliente', 'detalles'],
    });
    if (!nd) throw new NotFoundException(`Nota de Débito #${id} no encontrada`);
    return nd;
  }

  async emitir(id: number) {
    const nd = await this.findOne(id);
    if (nd.estado !== EstadoNotaDebito.BORRADOR) {
      throw new BadRequestException('Solo se puede emitir notas en BORRADOR');
    }
    await this.ndRepo.update(id, { estado: EstadoNotaDebito.EMITIDA });
    return this.findOne(id);
  }

  async anular(id: number) {
    const nd = await this.findOne(id);
    if (nd.estado === EstadoNotaDebito.ANULADA) {
      throw new BadRequestException('La nota ya está anulada');
    }
    await this.ndRepo.update(id, { estado: EstadoNotaDebito.ANULADA });
    return this.findOne(id);
  }

  async eliminar(id: number) {
    const nd = await this.findOne(id);
    if (nd.estado !== EstadoNotaDebito.BORRADOR) {
      throw new BadRequestException('Solo se pueden eliminar notas en BORRADOR');
    }
    await this.ndRepo.update(id, { isActive: false });
    return { ok: true };
  }

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const raw = await this.ndRepo
      .createQueryBuilder('nd')
      .select('nd.estado', 'estado')
      .addSelect('COUNT(nd.id)', 'cantidad')
      .addSelect('COALESCE(SUM(nd.total), 0)', 'total')
      .where('nd.empresaId = :eid', { eid: empresaId })
      .andWhere('nd.isActive = :a', { a: true })
      .groupBy('nd.estado')
      .getRawMany<{ estado: string; cantidad: string; total: string }>();
    return raw.map(r => ({ estado: r.estado, cantidad: Number(r.cantidad), total: Number(r.total) }));
  }
}
