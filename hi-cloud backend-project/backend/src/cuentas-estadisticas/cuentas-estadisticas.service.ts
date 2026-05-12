import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CuentaEstadistica, TipoCuentaEstadistica } from './entities/cuenta-estadistica.entity';
import { MovimientoEstadistico } from './entities/movimiento-estadistico.entity';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class CuentasEstadisticasService {
  constructor(
    @InjectRepository(CuentaEstadistica)
    private cuentaRepo: Repository<CuentaEstadistica>,
    @InjectRepository(MovimientoEstadistico)
    private movRepo: Repository<MovimientoEstadistico>,
    private tenantService: TenantService,
  ) {}

  // ── Cuentas ───────────────────────────────────────────────────────────────

  async crear(dto: {
    codigo: string; nombre: string; descripcion?: string;
    unidad?: string; tipo?: TipoCuentaEstadistica; categoria?: string;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    const existe    = await this.cuentaRepo.findOne({ where: { codigo: dto.codigo, empresaId, isActive: true } });
    if (existe) throw new ConflictException(`Código "${dto.codigo}" ya existe`);

    const c = this.cuentaRepo.create({ ...dto, empresaId, activa: true });
    return this.cuentaRepo.save(c);
  }

  async listar(categoria?: string) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.cuentaRepo.createQueryBuilder('c')
      .where('c.empresaId = :eid', { eid: empresaId })
      .andWhere('c.isActive = true');
    if (categoria) qb.andWhere('c.categoria = :cat', { cat: categoria });
    return qb.orderBy('c.codigo', 'ASC').getMany();
  }

  async findById(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const c = await this.cuentaRepo.findOne({ where: { id, empresaId, isActive: true } });
    if (!c) throw new NotFoundException(`Cuenta estadística #${id} no encontrada`);
    return c;
  }

  async update(id: number, dto: Partial<{ nombre: string; descripcion: string; unidad: string; activa: boolean; categoria: string }>) {
    await this.findById(id);
    await this.cuentaRepo.update(id, dto as any);
    return this.cuentaRepo.findOne({ where: { id } });
  }

  async delete(id: number) {
    await this.findById(id);
    await this.cuentaRepo.update(id, { isActive: false });
    return { message: 'Cuenta eliminada' };
  }

  // ── Movimientos ───────────────────────────────────────────────────────────

  async registrar(dto: {
    cuentaId: number; fecha: string; valor: number;
    descripcion?: string; referencia?: string; userId?: number;
  }) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.findById(dto.cuentaId);
    const mov = this.movRepo.create({ ...dto, fecha: new Date(dto.fecha), empresaId });
    return this.movRepo.save(mov);
  }

  async getMovimientos(cuentaId: number, desde?: string, hasta?: string) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.findById(cuentaId);

    const qb = this.movRepo.createQueryBuilder('m')
      .where('m.empresaId = :eid', { eid: empresaId })
      .andWhere('m.cuentaId = :cid', { cid: cuentaId })
      .andWhere('m.isActive = true');

    if (desde) qb.andWhere('m.fecha >= :desde', { desde });
    if (hasta) qb.andWhere('m.fecha <= :hasta', { hasta });

    return qb.orderBy('m.fecha', 'DESC').take(365).getMany();
  }

  async deleteMovimiento(id: number) {
    const empresaId = this.tenantService.getEmpresaId();
    await this.movRepo.update({ id, empresaId }, { isActive: false });
    return { message: 'Movimiento eliminado' };
  }

  // ── Resumen mensual por cuenta ─────────────────────────────────────────────

  async getResumenMensual(cuentaId: number, anio: number) {
    const empresaId = this.tenantService.getEmpresaId();
    const cuenta    = await this.findById(cuentaId);

    const rows = await this.movRepo
      .createQueryBuilder('m')
      .select('EXTRACT(MONTH FROM m.fecha)::INT', 'mes')
      .addSelect('COUNT(m.id)',              'registros')
      .addSelect('COALESCE(SUM(m.valor), 0)', 'suma')
      .addSelect('COALESCE(AVG(m.valor), 0)', 'promedio')
      .addSelect('COALESCE(MAX(m.valor), 0)', 'maximo')
      .where('m.empresaId = :eid', { eid: empresaId })
      .andWhere('m.cuentaId = :cid', { cid: cuentaId })
      .andWhere('m.isActive = true')
      .andWhere('EXTRACT(YEAR FROM m.fecha) = :anio', { anio })
      .groupBy('EXTRACT(MONTH FROM m.fecha)')
      .orderBy('mes', 'ASC')
      .getRawMany();

    const meses = Array.from({ length: 12 }, (_, i) => {
      const row = rows.find(r => Number(r.mes) === i + 1);
      const valor = row
        ? cuenta.tipo === TipoCuentaEstadistica.PROMEDIO ? Number(row.promedio)
        : cuenta.tipo === TipoCuentaEstadistica.MAXIMO   ? Number(row.maximo)
        : cuenta.tipo === TipoCuentaEstadistica.CONTEO   ? Number(row.registros)
        : Number(row.suma)
        : 0;
      return { mes: i + 1, valor: Number(valor.toFixed(4)), registros: Number(row?.registros ?? 0) };
    });

    return {
      cuenta: { id: cuenta.id, codigo: cuenta.codigo, nombre: cuenta.nombre, unidad: cuenta.unidad, tipo: cuenta.tipo },
      anio,
      meses,
      total: Number(meses.reduce((s, m) => s + m.valor, 0).toFixed(4)),
    };
  }

  // ── Dashboard de todas las cuentas ────────────────────────────────────────

  async getDashboard() {
    const empresaId = this.tenantService.getEmpresaId();
    const cuentas   = await this.listar();
    const anio      = new Date().getFullYear();
    const mesActual = new Date().getMonth() + 1;

    const resumen = await Promise.all(cuentas.map(async c => {
      const row = await this.movRepo
        .createQueryBuilder('m')
        .select('COALESCE(SUM(m.valor), 0)', 'suma')
        .addSelect('COALESCE(AVG(m.valor), 0)', 'promedio')
        .addSelect('COALESCE(MAX(m.valor), 0)', 'maximo')
        .addSelect('COUNT(m.id)', 'registros')
        .where('m.cuentaId = :cid AND m.empresaId = :eid', { cid: c.id, eid: empresaId })
        .andWhere('m.isActive = true')
        .andWhere('EXTRACT(YEAR FROM m.fecha) = :a AND EXTRACT(MONTH FROM m.fecha) = :m', { a: anio, m: mesActual })
        .getRawOne();

      const valorMes = c.tipo === TipoCuentaEstadistica.PROMEDIO ? Number(row?.promedio ?? 0)
                     : c.tipo === TipoCuentaEstadistica.MAXIMO   ? Number(row?.maximo   ?? 0)
                     : c.tipo === TipoCuentaEstadistica.CONTEO   ? Number(row?.registros ?? 0)
                     : Number(row?.suma ?? 0);

      return { ...c, valorMesSuma: Number(valorMes.toFixed(4)), registrosMes: Number(row?.registros ?? 0) };
    }));

    return { anio, mes: mesActual, cuentas: resumen };
  }
}
