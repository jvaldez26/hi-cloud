import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CentroCosto, TipoCentroCosto } from './entities/centro-costo.entity';
import { AsignacionCosto } from './entities/asignacion-costo.entity';
import { TenantService } from '../tenant/tenant.service';

interface CreateCCDto {
  codigo: string; nombre: string; descripcion?: string;
  tipo?: TipoCentroCosto; presupuesto?: number; parentId?: number;
}

interface CreateAsignacionDto {
  centroCostoId: number; tipoDocumento: string; documentoId: number;
  monto: number; porcentaje?: number; nota?: string; fecha: string;
}

@Injectable()
export class CentroCostosService {
  constructor(
    @InjectRepository(CentroCosto)    private ccRepo:  Repository<CentroCosto>,
    @InjectRepository(AsignacionCosto)private asigRepo: Repository<AsignacionCosto>,
    private tenantService: TenantService,
  ) {}

  // ── Centros de costo ─────────────────────────────────────────────────────

  async crear(dto: CreateCCDto): Promise<CentroCosto> {
    return this.ccRepo.save(this.ccRepo.create(dto));
  }

  async listar(): Promise<CentroCosto[]> {
    return this.ccRepo.find({ where: { empresaId: this.tenantService.getEmpresaId(), isActive: true }, order: { codigo: 'ASC' } });
  }

  async findById(id: number): Promise<CentroCosto> {
    const cc = await this.ccRepo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true } });
    if (!cc) throw new NotFoundException(`Centro de costo #${id} no encontrado`);
    return cc;
  }

  async actualizar(id: number, dto: Partial<CreateCCDto>) {
    await this.findById(id);
    await this.ccRepo.update(id, dto as any);
    return this.findById(id);
  }

  async eliminar(id: number) {
    await this.findById(id);
    await this.ccRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Asignaciones ─────────────────────────────────────────────────────────

  async asignar(dto: CreateAsignacionDto): Promise<AsignacionCosto> {
    await this.findById(dto.centroCostoId);
    return this.asigRepo.save(this.asigRepo.create({
      ...dto,
      fecha: new Date(dto.fecha),
      porcentaje: dto.porcentaje ?? 100,
    }));
  }

  async listarAsignaciones(centroCostoId: number, anio?: number) {
    const qb = this.asigRepo.createQueryBuilder('a')
      .leftJoinAndSelect('a.centroCosto', 'cc')
      .where('a.centroCostoId = :ccid', { ccid: centroCostoId })
      .andWhere('a.isActive = true');

    if (anio) {
      qb.andWhere('EXTRACT(YEAR FROM a.fecha) = :y', { y: anio });
    }

    return qb.orderBy('a.fecha', 'DESC').getMany();
  }

  async eliminarAsignacion(id: number) {
    await this.asigRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Reporte por centro de costo ───────────────────────────────────────────

  async getReporte(anio: number) {
    const centros = await this.listar();

    const reportes = await Promise.all(centros.map(async (cc) => {
      const asigs = await this.asigRepo
        .createQueryBuilder('a')
        .select([
          'a.tipoDocumento AS tipo',
          'COUNT(*) AS cantidad',
          'SUM(a.monto * a.porcentaje / 100) AS total',
        ])
        .where('a.centroCostoId = :ccid', { ccid: cc.id })
        .andWhere('EXTRACT(YEAR FROM a.fecha) = :y', { y: anio })
        .andWhere('a.isActive = true')
        .groupBy('a.tipoDocumento')
        .getRawMany();

      const total = asigs.reduce((s: number, a: any) => s + Number(a.total ?? 0), 0);
      const presupuesto = Number(cc.presupuesto ?? 0);

      return {
        id:           cc.id,
        codigo:       cc.codigo,
        nombre:       cc.nombre,
        tipo:         cc.tipo,
        presupuesto,
        ejecutado:    total,
        disponible:   presupuesto - total,
        porcentajeEjecutado: presupuesto > 0 ? Math.round((total / presupuesto) * 100) : 0,
        desglose:     asigs,
      };
    }));

    return {
      anio,
      centros:          reportes,
      totalEjecutado:   reportes.reduce((s, r) => s + r.ejecutado, 0),
      totalPresupuesto: reportes.reduce((s, r) => s + r.presupuesto, 0),
    };
  }

  async getReporteMensual(centroCostoId: number, anio: number) {
    const meses = await this.asigRepo
      .createQueryBuilder('a')
      .select([
        'EXTRACT(MONTH FROM a.fecha) AS mes',
        'SUM(a.monto * a.porcentaje / 100) AS total',
        'COUNT(*) AS cantidad',
      ])
      .where('a.centroCostoId = :ccid', { ccid: centroCostoId })
      .andWhere('EXTRACT(YEAR FROM a.fecha) = :y', { y: anio })
      .andWhere('a.isActive = true')
      .groupBy('EXTRACT(MONTH FROM a.fecha)')
      .orderBy('mes', 'ASC')
      .getRawMany();

    return meses.map(m => ({ mes: Number(m.mes), total: Number(m.total), cantidad: Number(m.cantidad) }));
  }
}
