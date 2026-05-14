import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Licitacion, EstadoLicitacion } from './entities/licitacion.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class LicitacionesService {
  constructor(
    @InjectRepository(Licitacion) private repo: Repository<Licitacion>,
    private tenantService: TenantService,
  ) {}

  private async generarNumero(): Promise<string> {
    const empresaId = this.tenantService.getEmpresaId();
    const res = await this.repo
      .createQueryBuilder('l')
      .select(`MAX(CASE WHEN l.numero ~ '^LIC-[0-9]+$' THEN CAST(SUBSTRING(l.numero FROM 5) AS INTEGER) ELSE 100 END)`, 'maxNum')
      .where('l.empresaId = :eid', { eid: empresaId })
      .andWhere('l.isActive = :a', { a: true })
      .getRawOne<{ maxNum: number | null }>();
    return `LIC-${Math.max(101, (res?.maxNum ?? 100) + 1)}`;
  }

  async crear(dto: any) {
    const numero = await this.generarNumero();
    return this.repo.save(this.repo.create({
      empresaId: this.tenantService.getEmpresaId(),
      ...dto,
      numero,
      fechaPublicacion:    new Date(dto.fechaPublicacion),
      fechaLimiteOfertas:  dto.fechaLimiteOfertas  ? new Date(dto.fechaLimiteOfertas)  : undefined,
      fechaApertura:       dto.fechaApertura        ? new Date(dto.fechaApertura)        : undefined,
      fechaAdjudicacion:   dto.fechaAdjudicacion    ? new Date(dto.fechaAdjudicacion)    : undefined,
    }));
  }

  async listar(pagination: PaginationDto, estado?: EstadoLicitacion) {
    const { limit = 10, page = 1, search } = pagination;
    const qb = this.repo.createQueryBuilder('l').where('l.isActive = true');

    if (estado)  qb.andWhere('l.estado = :e',   { e: estado });
    if (search)  qb.andWhere('(l.titulo ILIKE :s OR l.entidadConvocante ILIKE :s)', { s: `%${search}%` });

    const [data, total] = await qb
      .orderBy('l.fechaLimiteOfertas', 'ASC')
      .skip((page - 1) * limit).take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit } };
  }

  async findById(id: number): Promise<Licitacion> {
    const l = await this.repo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true } });
    if (!l) throw new NotFoundException(`Licitación #${id} no encontrada`);
    return l;
  }

  async actualizar(id: number, dto: any): Promise<Licitacion> {
    await this.findById(id);
    const update: any = { ...dto };
    if (dto.fechaPublicacion)  update.fechaPublicacion  = new Date(dto.fechaPublicacion);
    if (dto.fechaLimiteOfertas)update.fechaLimiteOfertas= new Date(dto.fechaLimiteOfertas);
    if (dto.fechaApertura)     update.fechaApertura     = new Date(dto.fechaApertura);
    if (dto.fechaAdjudicacion) update.fechaAdjudicacion = new Date(dto.fechaAdjudicacion);
    await this.repo.update(id, update);
    return this.findById(id);
  }

  async cambiarEstado(id: number, estado: EstadoLicitacion, motivo?: string): Promise<Licitacion> {
    await this.findById(id);
    await this.repo.update(id, { estado, motivoPerdida: motivo });
    return this.findById(id);
  }

  async eliminar(id: number) {
    await this.repo.update(id, { isActive: false });
    return { ok: true };
  }

  async getDashboard() {
    const hoy = new Date();
    const estados = ['identificada','en_proceso','presentada','adjudicada','perdida','cancelada'];
    const counts  = await Promise.all(
      estados.map(e => this.repo.count({ where: { isActive: true, estado: e as any } })),
    );
    const proximas = await this.repo.find({
      where: { isActive: true, estado: 'en_proceso' as any },
      order: { fechaLimiteOfertas: 'ASC' },
      take: 5,
    });
    const totalOfertado = await this.repo
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.montoOfertado),0)', 'total')
      .where('l.isActive = true')
      .andWhere('l.estado IN (:...e)', { e: ['presentada','adjudicada'] })
      .getRawOne<{ total: string }>();
    const totalAdjudicado = await this.repo
      .createQueryBuilder('l')
      .select('COALESCE(SUM(l.montoAdjudicado),0)', 'total')
      .where('l.isActive = true AND l.estado = :e', { e: 'adjudicada' })
      .getRawOne<{ total: string }>();

    return {
      por_estado: Object.fromEntries(estados.map((e, i) => [e, counts[i]])),
      proximas,
      totalOfertado:    Number(totalOfertado?.total  ?? 0),
      totalAdjudicado:  Number(totalAdjudicado?.total ?? 0),
      tasaExito: (counts[3] + counts[1] + counts[2]) > 0
        ? +((counts[3] / (counts[3] + counts[4])) * 100).toFixed(1) : 0,
    };
  }
}
