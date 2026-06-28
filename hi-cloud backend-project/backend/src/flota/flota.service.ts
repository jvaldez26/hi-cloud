import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Vehiculo, EstadoVehiculo } from './entities/vehiculo.entity';
import { RegistroFlota, TipoRegistroFlota } from './entities/registro-flota.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class FlotaService {
  constructor(
    @InjectRepository(Vehiculo)      private vehRepo: Repository<Vehiculo>,
    @InjectRepository(RegistroFlota) private regRepo: Repository<RegistroFlota>,
    private tenantService: TenantService,
  ) {}

  async crearVehiculo(dto: any) {
    return this.vehRepo.save(this.vehRepo.create({
      empresaId: this.tenantService.getEmpresaId(),
      ...dto,
      vencimientoItbis:       dto.vencimientoItbis       ? new Date(dto.vencimientoItbis)       : undefined,
      vencimientoSeguro:      dto.vencimientoSeguro       ? new Date(dto.vencimientoSeguro)      : undefined,
      vencimientoInspeccion:  dto.vencimientoInspeccion   ? new Date(dto.vencimientoInspeccion)  : undefined,
    }));
  }

  async listarVehiculos() {
    return this.vehRepo.find({ where: { empresaId: this.tenantService.getEmpresaId(), isActive: true }, order: { placa: 'ASC' } });
  }

  async getVehiculo(id: number): Promise<Vehiculo> {
    const v = await this.vehRepo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true } });
    if (!v) throw new NotFoundException(`Vehículo #${id} no encontrado`);
    return v;
  }

  async actualizarVehiculo(id: number, dto: any) {
    await this.getVehiculo(id);
    const update: any = { ...dto };
    if (dto.vencimientoItbis)      update.vencimientoItbis      = new Date(dto.vencimientoItbis);
    if (dto.vencimientoSeguro)     update.vencimientoSeguro     = new Date(dto.vencimientoSeguro);
    if (dto.vencimientoInspeccion) update.vencimientoInspeccion = new Date(dto.vencimientoInspeccion);
    await this.vehRepo.update(id, update);
    return this.getVehiculo(id);
  }

  async eliminarVehiculo(id: number) {
    await this.getVehiculo(id);
    await this.vehRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Registros ─────────────────────────────────────────────────────────────

  async registrar(dto: any, usuarioId: number) {
    await this.getVehiculo(dto.vehiculoId);
    const reg = await this.regRepo.save(this.regRepo.create({
      empresaId: this.tenantService.getEmpresaId(),
      ...dto,
      fecha:     new Date(dto.fecha),
      usuarioId,
    }));
    if (dto.kilometraje) {
      await this.vehRepo.update(dto.vehiculoId, { kilometraje: dto.kilometraje });
    }
    return reg;
  }

  async listarRegistros(vehiculoId: number, pagination: PaginationDto) {
    const { limit = 20, page = 1 } = pagination;
    const [data, total] = await this.regRepo.findAndCount({
      where: { vehiculoId, empresaId: this.tenantService.getEmpresaId(), isActive: true },
      order: { fecha: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { total, page, limit } };
  }

  async eliminarRegistro(id: number) {
    const reg = await this.regRepo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true } });
    if (!reg) throw new NotFoundException(`Registro #${id} no encontrado`);
    await this.regRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboard() {
    const hoy    = new Date();
    const en30   = new Date(hoy); en30.setDate(hoy.getDate() + 30);
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const empresaId = this.tenantService.getEmpresaId();

    const [activos, enTaller, inactivos] = await Promise.all([
      this.vehRepo.count({ where: { empresaId, isActive: true, estado: EstadoVehiculo.ACTIVO } }),
      this.vehRepo.count({ where: { empresaId, isActive: true, estado: EstadoVehiculo.EN_TALLER } }),
      this.vehRepo.count({ where: { empresaId, isActive: true, estado: EstadoVehiculo.INACTIVO } }),
    ]);

    // Documentos por vencer (marbete, seguro, inspección) en los próximos 30 días
    const vencenItbis      = await this.vehRepo.count({ where: { empresaId, isActive: true, vencimientoItbis:       LessThanOrEqual(en30) } });
    const vencenSeguro     = await this.vehRepo.count({ where: { empresaId, isActive: true, vencimientoSeguro:      LessThanOrEqual(en30) } });
    const vencenInspeccion = await this.vehRepo.count({ where: { empresaId, isActive: true, vencimientoInspeccion:  LessThanOrEqual(en30) } });

    // Gasto del mes por tipo
    const gastoMes = await this.regRepo
      .createQueryBuilder('r')
      .select(['r.tipo AS tipo', 'COALESCE(SUM(r.monto),0) AS total'])
      .where('r.empresaId = :empresaId', { empresaId })
      .andWhere('r.fecha >= :inicio', { inicio })
      .andWhere('r.isActive = true')
      .groupBy('r.tipo')
      .getRawMany();

    const totalGastoMes = gastoMes.reduce((s: number, g: any) => s + Number(g.total), 0);

    // Total litros combustible este mes
    const combustibleMes = await this.regRepo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.litros),0)', 'litros')
      .addSelect('COALESCE(SUM(r.monto),0)', 'monto')
      .where('r.empresaId = :empresaId', { empresaId })
      .andWhere('r.tipo = :t', { t: TipoRegistroFlota.COMBUSTIBLE })
      .andWhere('r.fecha >= :inicio', { inicio })
      .andWhere('r.isActive = true')
      .getRawOne<{ litros: string; monto: string }>();

    return {
      flota: { activos, enTaller, inactivos, total: activos + enTaller + inactivos },
      alertas: { vencenItbis, vencenSeguro, vencenInspeccion },
      gastoMes: { total: totalGastoMes, por_tipo: gastoMes },
      combustible: {
        litros: Number(combustibleMes?.litros ?? 0),
        monto:  Number(combustibleMes?.monto  ?? 0),
      },
    };
  }

  async getResumenVehiculo(id: number) {
    await this.getVehiculo(id);
    const gastos = await this.regRepo
      .createQueryBuilder('r')
      .select(['r.tipo AS tipo', 'SUM(r.monto) AS total', 'COUNT(*) AS cantidad'])
      .where('r.vehiculoId = :vid', { vid: id })
      .andWhere('r.empresaId = :empresaId', { empresaId: this.tenantService.getEmpresaId() })
      .andWhere('r.isActive = true')
      .groupBy('r.tipo')
      .getRawMany();

    const costoTotal = gastos.reduce((s: number, g: any) => s + Number(g.total), 0);
    return { gastos, costoTotal };
  }
}
