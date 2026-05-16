import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReciboCobro, MetodoPagoRecibo } from './entities/recibo-cobro.entity';
import { TenantService } from '../tenant/tenant.service';
import { PaginationDto } from '../common/dto/pagination.dto';

interface CreateReciboDto {
  clienteId?:   number;        // opcional — puede ser recibo sin cliente nombrado
  clienteNombre?: string;
  fecha?:       string;        // si no se envía, el controller provee la fecha del día
  monto:        number;
  metodoPago:   MetodoPagoRecibo;
  concepto:     string;
  facturaId?:   number;
  facturaFolio?: string;
  cxcId?:       number;
  referencia?:  string;
  notas?:       string;
  nombreUsuario?: string;
}

@Injectable()
export class RecibosCobrosService {
  constructor(
    @InjectRepository(ReciboCobro)
    private repo: Repository<ReciboCobro>,
    private tenantSvc: TenantService,
  ) {}

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const res = await this.repo
      .createQueryBuilder('r')
      .select(`MAX(CASE WHEN r.numero ~ '^REC-[0-9]+$'
                        THEN CAST(SUBSTRING(r.numero FROM 5) AS INTEGER)
                        ELSE 100 END)`, 'maxNum')
      .where('r.empresaId = :eid', { eid: empresaId })
      .andWhere('r.isActive = :a', { a: true })
      .getRawOne<{ maxNum: number | null }>();
    return `REC-${Math.max(101, (res?.maxNum ?? 100) + 1)}`;
  }

  async crear(dto: CreateReciboDto, usuarioId: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const numero    = await this.generarNumero();
    return this.repo.save(
      this.repo.create({ ...dto, empresaId, numero, usuarioId }),
    );
  }

  async listar(pagination: PaginationDto, clienteId?: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const { limit = 10, page = 1 } = pagination;
    const where: any = { empresaId, isActive: true };
    if (clienteId) where.clienteId = clienteId;

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { fecha: 'DESC', createdAt: 'DESC' },
      skip:  (page - 1) * limit,
      take:  Math.min(limit, 100),
    });

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    const r = await this.repo.findOne({ where: { id, empresaId, isActive: true } });
    if (!r) throw new NotFoundException(`Recibo #${id} no encontrado`);
    return r;
  }

  async eliminar(id: number) {
    await this.findOne(id);
    await this.repo.update(id, { isActive: false });
    return { ok: true };
  }

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const hoy       = new Date().toISOString().split('T')[0];
    const mes       = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const [hoyR, mesR, totalR] = await Promise.all([
      this.repo
        .createQueryBuilder('r')
        .select('COALESCE(SUM(r.monto),0)', 'total')
        .addSelect('COUNT(r.id)', 'cantidad')
        .where('r.empresaId = :eid', { eid: empresaId })
        .andWhere('r.isActive = true')
        .andWhere('r.fecha = :hoy', { hoy })
        .getRawOne<{ total: string; cantidad: string }>(),

      this.repo
        .createQueryBuilder('r')
        .select('COALESCE(SUM(r.monto),0)', 'total')
        .where('r.empresaId = :eid', { eid: empresaId })
        .andWhere('r.isActive = true')
        .andWhere("TO_CHAR(r.fecha::date, 'YYYY-MM') = :mes", { mes })
        .getRawOne<{ total: string }>(),

      this.repo
        .createQueryBuilder('r')
        .select('COALESCE(SUM(r.monto),0)', 'total')
        .addSelect('COUNT(r.id)', 'cantidad')
        .where('r.empresaId = :eid', { eid: empresaId })
        .andWhere('r.isActive = true')
        .getRawOne<{ total: string; cantidad: string }>(),
    ]);

    return {
      hoy:   { total: +Number(hoyR?.total ?? 0).toFixed(2), cantidad: Number(hoyR?.cantidad ?? 0) },
      mes:   { total: +Number(mesR?.total ?? 0).toFixed(2) },
      total: { total: +Number(totalR?.total ?? 0).toFixed(2), cantidad: Number(totalR?.cantidad ?? 0) },
    };
  }
}
