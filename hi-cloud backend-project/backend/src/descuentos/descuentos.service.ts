import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReglaDescuento, TipoDescuento, CondicionDescuento } from './entities/regla-descuento.entity';
import { TenantService } from '../tenant/tenant.service';

interface CalcularDescuentoDto {
  productoId:    number;
  categoria?:    string;
  cantidad:      number;
  precioUnitario: number;
  subtotalLinea: number;
}

export interface ResultadoDescuento {
  montoDescuento: number;
  porcentaje:     number;
  regla?:         string;
}

@Injectable()
export class DescuentosService {
  constructor(
    @InjectRepository(ReglaDescuento)
    private reglaRepo: Repository<ReglaDescuento>,
    private tenantSvc: TenantService,
  ) {}

  listar() {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.reglaRepo.find({
      where: { empresaId, isActive: true },
      order: { prioridad: 'DESC', nombre: 'ASC' },
    });
  }

  async crear(dto: Partial<ReglaDescuento>) {
    const empresaId = this.tenantSvc.getEmpresaId();
    return this.reglaRepo.save(this.reglaRepo.create({ ...dto, empresaId }));
  }

  async actualizar(id: number, dto: Partial<ReglaDescuento>) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.reglaRepo.update({ id, empresaId }, dto);
    return this.reglaRepo.findOneByOrFail({ id, empresaId });
  }

  async eliminar(id: number) {
    const empresaId = this.tenantSvc.getEmpresaId();
    await this.reglaRepo.update({ id, empresaId }, { isActive: false });
  }

  // ─── Motor de cálculo de descuentos ──────────────────────────────────────────

  async calcular(items: CalcularDescuentoDto[]): Promise<ResultadoDescuento[]> {
    const empresaId = this.tenantSvc.getEmpresaId();
    const hoy       = new Date().toISOString().split('T')[0];

    const reglas = await this.reglaRepo
      .createQueryBuilder('r')
      .where('r.empresaId = :eid', { eid: empresaId })
      .andWhere('r.activo = true')
      .andWhere('r.isActive = true')
      .andWhere('(r.fechaDesde IS NULL OR r.fechaDesde <= :hoy)', { hoy })
      .andWhere('(r.fechaHasta IS NULL OR r.fechaHasta >= :hoy)', { hoy })
      .orderBy('r.prioridad', 'DESC')
      .getMany();

    return items.map(item => this.aplicarDescuento(item, reglas));
  }

  private aplicarDescuento(
    item: CalcularDescuentoDto,
    reglas: ReglaDescuento[],
  ): ResultadoDescuento {
    // Aplica la regla de mayor prioridad que coincida
    for (const regla of reglas) {
      if (!this.cumpleCondicion(regla, item)) continue;

      const base = item.subtotalLinea;
      if (regla.tipo === TipoDescuento.PORCENTAJE) {
        const monto = +(base * Number(regla.valor) / 100).toFixed(2);
        return { montoDescuento: monto, porcentaje: Number(regla.valor), regla: regla.nombre };
      }
      if (regla.tipo === TipoDescuento.MONTO_FIJO) {
        const pct = base > 0 ? +((Number(regla.valor) / base) * 100).toFixed(2) : 0;
        return { montoDescuento: Math.min(Number(regla.valor), base), porcentaje: pct, regla: regla.nombre };
      }
    }

    return { montoDescuento: 0, porcentaje: 0 };
  }

  private cumpleCondicion(regla: ReglaDescuento, item: CalcularDescuentoDto): boolean {
    switch (regla.condicion) {
      case CondicionDescuento.SIEMPRE:
        return true;

      case CondicionDescuento.CATEGORIA:
        return !!item.categoria &&
          item.categoria.toLowerCase() === (regla.condicionValor ?? '').toLowerCase();

      case CondicionDescuento.PRODUCTO:
        return String(item.productoId) === (regla.condicionValor ?? '');

      case CondicionDescuento.CANTIDAD_MIN:
        return item.cantidad >= Number(regla.condicionValor ?? 0);

      case CondicionDescuento.MONTO_MIN:
        return item.subtotalLinea >= Number(regla.condicionValor ?? 0);

      case CondicionDescuento.FECHA:
        // Solo fecha ya está filtrada en la query (fechaDesde/fechaHasta)
        return true;

      default:
        return false;
    }
  }

  async resumen() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const total    = await this.reglaRepo.count({ where: { empresaId, isActive: true } });
    const activas  = await this.reglaRepo.count({ where: { empresaId, isActive: true, activo: true } });
    return { total, activas, inactivas: total - activas };
  }
}
