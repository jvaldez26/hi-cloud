import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { NotaCreditoCompra, EstadoNCCompra, MotivoNCCompra } from './entities/nota-credito-compra.entity';
import { NotaCreditoCompraDetalle } from './entities/nota-credito-compra-detalle.entity';
import { Producto } from '../productos/entities/producto.entity';
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

interface CreateNCCDto {
  proveedorId:          number;
  fecha:                string;
  compraOriginalId?:    number;
  compraOriginalFolio?: string;
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
    private dataSource:  DataSource,
    private tenantSvc:   TenantService,
  ) {}

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const d   = new Date();
    const pre = `NCC-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-`;
    const res = await this.nccRepo
      .createQueryBuilder('n')
      .select(`MAX(CAST(SPLIT_PART(n.numero, '-', 3) AS INTEGER))`, 'maxNum')
      .where('n.numero LIKE :p',      { p: `${pre}%` })
      .andWhere('n.empresaId = :eid', { eid: empresaId })
      .getRawOne<{ maxNum: number | null }>();
    return `${pre}${String((res?.maxNum ?? 0) + 1).padStart(4, '0')}`;
  }

  async crear(dto: CreateNCCDto, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero    = await this.generarNumero();

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
      compraOriginalId:     dto.compraOriginalId,
      compraOriginalFolio:  dto.compraOriginalFolio,
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
    const n = await this.nccRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!n) throw new NotFoundException(`Nota de Crédito Compra #${id} no encontrada`);
    return n;
  }

  async recibir(id: number) {
    const ncc = await this.findOne(id);
    if (ncc.estado !== EstadoNCCompra.BORRADOR) {
      throw new BadRequestException('Solo se puede confirmar notas en BORRADOR');
    }

    // Revertir stock (devolvemos mercancía al proveedor → reducimos inventario)
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

    return this.findOne(id);
  }

  async anular(id: number) {
    const ncc = await this.findOne(id);
    if (ncc.estado === EstadoNCCompra.ANULADA) throw new BadRequestException('Ya está anulada');
    await this.nccRepo.update(id, { estado: EstadoNCCompra.ANULADA });
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
