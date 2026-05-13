import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PreFactura, EstadoPreFactura } from './entities/pre-factura.entity';
import { PreFacturaDetalle } from './entities/pre-factura-detalle.entity';
import { Factura, FacturaEstado } from '../facturas/entities/factura.entity';
import { TenantService } from '../tenant/tenant.service';
import { PaginationDto } from '../common/dto/pagination.dto';

interface DetalleDto {
  productoId?: number;
  descripcion:   string;
  unidadMedida?: string;
  cantidad:      number;
  precioUnitario: number;
  porcentajeIva?: number;
}

interface CreatePreFacturaDto {
  clienteId:          number;
  fecha:              string;
  fechaVencimiento?:  string;
  tipoNcf?:           string;
  notas?:             string;
  sucursalId?:        number;
  detalles:           DetalleDto[];
}

@Injectable()
export class PreFacturaService {
  constructor(
    @InjectRepository(PreFactura)       private pfRepo:       Repository<PreFactura>,
    @InjectRepository(PreFacturaDetalle) private pfDetRepo:    Repository<PreFacturaDetalle>,
    @InjectRepository(Factura)          private facturaRepo:  Repository<Factura>,
    private tenantSvc: TenantService,
  ) {}

  // ─── Folio ────────────────────────────────────────────────────────────────────

  private async generarFolio(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const d   = new Date();
    const pre = `PRE-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-`;
    const res = await this.pfRepo
      .createQueryBuilder('pf')
      .select(`MAX(CAST(SPLIT_PART(pf.folio, '-', 3) AS INTEGER))`, 'maxNum')
      .where('pf.folio LIKE :p',       { p: `${pre}%` })
      .andWhere('pf.empresaId = :eid', { eid: empresaId })
      .getRawOne<{ maxNum: number | null }>();
    return `${pre}${String((res?.maxNum ?? 0) + 1).padStart(4, '0')}`;
  }

  // ─── Calcular totales ─────────────────────────────────────────────────────────

  private calcularDetalles(detalles: DetalleDto[]) {
    return detalles.map(d => {
      const pctIva   = d.porcentajeIva ?? 18;
      const subtotal = +(d.cantidad * d.precioUnitario).toFixed(2);
      const iva      = +(subtotal * pctIva / 100).toFixed(2);
      return {
        ...d,
        unidadMedida: d.unidadMedida ?? 'PZA',
        porcentajeIva: pctIva,
        subtotal,
        iva,
        total: +(subtotal + iva).toFixed(2),
      };
    });
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────────

  async crear(dto: CreatePreFacturaDto, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const folio     = await this.generarFolio();
    const detalles  = this.calcularDetalles(dto.detalles);

    const subtotal = detalles.reduce((s, d) => s + d.subtotal, 0);
    const iva      = detalles.reduce((s, d) => s + d.iva,      0);

    const pf = this.pfRepo.create({
      empresaId,
      folio,
      fecha:            dto.fecha as unknown as Date,
      fechaVencimiento: dto.fechaVencimiento as unknown as Date | undefined,
      clienteId:        dto.clienteId,
      usuarioId,
      tipoNcf:          dto.tipoNcf ?? 'E32',
      notas:            dto.notas,
      sucursalId:       dto.sucursalId,
      subtotal:         +subtotal.toFixed(2),
      iva:              +iva.toFixed(2),
      total:            +(subtotal + iva).toFixed(2),
      detalles:         detalles as unknown as PreFacturaDetalle[],
    });

    return this.pfRepo.save(pf);
  }

  async listar(pagination: PaginationDto, estado?: EstadoPreFactura) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const { limit = 10, page = 1, search } = pagination;

    const qb = this.pfRepo
      .createQueryBuilder('pf')
      .leftJoinAndSelect('pf.cliente', 'c')
      .where('pf.empresaId = :eid', { eid: empresaId })
      .andWhere('pf.isActive = :a',  { a: true });

    if (estado) qb.andWhere('pf.estado = :e', { e: estado });
    if (search) qb.andWhere('(pf.folio ILIKE :s OR c.nombre ILIKE :s)', { s: `%${search}%` });

    const [data, total] = await qb
      .orderBy('pf.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(Math.min(limit, 100))
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const pf = await this.pfRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!pf) throw new NotFoundException(`Pre-Factura #${id} no encontrada`);
    return pf;
  }

  async actualizar(id: number, dto: Partial<CreatePreFacturaDto>) {
    const pf = await this.findOne(id);
    if (pf.estado !== EstadoPreFactura.BORRADOR) {
      throw new BadRequestException('Solo se puede editar pre-facturas en borrador');
    }

    if (dto.detalles) {
      await this.pfDetRepo.delete({ preFacturaId: id });
      const detalles = this.calcularDetalles(dto.detalles);
      const subtotal = detalles.reduce((s, d) => s + d.subtotal, 0);
      const iva      = detalles.reduce((s, d) => s + d.iva, 0);
      await this.pfRepo.update(id, {
        ...dto,
        detalles: detalles as unknown as PreFacturaDetalle[],
        subtotal: +subtotal.toFixed(2),
        iva:      +iva.toFixed(2),
        total:    +(subtotal + iva).toFixed(2),
      } as any);
    } else {
      await this.pfRepo.update(id, dto as any);
    }

    return this.findOne(id);
  }

  // ─── Ciclo de vida ────────────────────────────────────────────────────────────

  async enviar(id: number) {
    const pf = await this.findOne(id);
    if (pf.estado !== EstadoPreFactura.BORRADOR) {
      throw new BadRequestException('Solo se puede enviar pre-facturas en borrador');
    }
    await this.pfRepo.update(id, { estado: EstadoPreFactura.ENVIADA });
    return this.findOne(id);
  }

  async aprobar(id: number) {
    const pf = await this.findOne(id);
    if (![EstadoPreFactura.ENVIADA, EstadoPreFactura.BORRADOR].includes(pf.estado)) {
      throw new BadRequestException('Estado inválido para aprobar');
    }
    await this.pfRepo.update(id, { estado: EstadoPreFactura.APROBADA });
    return this.findOne(id);
  }

  async rechazar(id: number, motivo: string) {
    const pf = await this.findOne(id);
    if (pf.estado === EstadoPreFactura.CONVERTIDA) {
      throw new BadRequestException('No se puede rechazar una pre-factura ya convertida');
    }
    await this.pfRepo.update(id, { estado: EstadoPreFactura.RECHAZADA, motivoRechazo: motivo });
    return this.findOne(id);
  }

  // ─── Convertir a Factura ──────────────────────────────────────────────────────

  async convertirAFactura(id: number, usuarioId: number, tipoNcf?: string) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const pf = await this.findOne(id);

    if (pf.estado !== EstadoPreFactura.APROBADA) {
      throw new BadRequestException('Solo se pueden convertir pre-facturas aprobadas');
    }

    // Generar folio de factura (MAX + 1)
    const d   = new Date();
    const pre = `FAC-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-`;
    const res = await this.facturaRepo
      .createQueryBuilder('f')
      .select(`MAX(CAST(SPLIT_PART(f.folio, '-', 3) AS INTEGER))`, 'maxNum')
      .where('f.folio LIKE :p',       { p: `${pre}%` })
      .andWhere('f.empresaId = :eid', { eid: empresaId })
      .getRawOne<{ maxNum: number | null }>();
    const folio = `${pre}${String((res?.maxNum ?? 0) + 1).padStart(4, '0')}`;

    const factura = this.facturaRepo.create({
      empresaId,
      folio,
      fecha:     new Date(),
      estado:    FacturaEstado.EMITIDA,
      clienteId: pf.clienteId,
      usuarioId,
      subtotal:  pf.subtotal,
      iva:       pf.iva,
      total:     pf.total,
      tipoNcf:   tipoNcf ?? pf.tipoNcf ?? 'E32',
      notas:     pf.notas,
      sucursalId: pf.sucursalId,
      detalles:  pf.detalles.map(det => ({
        productoId:     det.productoId,
        descripcion:    det.descripcion,
        cantidad:       Math.round(Number(det.cantidad)),   // INT en FacturaDetalle
        precioUnitario: Number(det.precioUnitario),
        porcentajeIva:  Number(det.porcentajeIva),
        subtotal:       Number(det.subtotal),
        importeIva:     Number(det.iva),
        total:          Number(det.total),
      })) as any,
    });

    const savedFactura = await this.facturaRepo.save(factura);

    await this.pfRepo.update(id, {
      estado:    EstadoPreFactura.CONVERTIDA,
      facturaId: savedFactura.id,
    });

    return {
      preFactura: await this.findOne(id),
      factura:    savedFactura,
      mensaje:    `Pre-factura ${pf.folio} convertida a factura ${savedFactura.folio}`,
    };
  }

  async eliminar(id: number) {
    const pf = await this.findOne(id);
    if (pf.estado === EstadoPreFactura.CONVERTIDA) {
      throw new BadRequestException('No se puede eliminar una pre-factura convertida');
    }
    await this.pfRepo.update(id, { isActive: false });
    return { ok: true };
  }

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const raw = await this.pfRepo
      .createQueryBuilder('pf')
      .select('pf.estado', 'estado')
      .addSelect('COUNT(pf.id)', 'cantidad')
      .addSelect('COALESCE(SUM(pf.total), 0)', 'totalMonto')
      .where('pf.empresaId = :eid', { eid: empresaId })
      .andWhere('pf.isActive = :a', { a: true })
      .groupBy('pf.estado')
      .getRawMany<{ estado: string; cantidad: string; totalMonto: string }>();

    return raw.map(r => ({
      estado:      r.estado,
      cantidad:    Number(r.cantidad),
      totalMonto:  Number(r.totalMonto),
    }));
  }
}
