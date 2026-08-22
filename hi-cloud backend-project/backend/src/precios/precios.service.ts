import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PrecioEspecial, TierPrecio } from './entities/precio-especial.entity';
import { TenantService } from '../tenant/tenant.service';
import { fechaHoyRD } from '../common/utils/fecha-local.util';

interface CreatePrecioDto {
  productoId:          number;
  clienteId?:          number;
  tier?:               TierPrecio;
  nombre?:             string;
  precioFijo?:         number;
  descuentoPorcentaje?:number;
  vigenciaDesde?:      string;
  vigenciaHasta?:      string;
  userId:              number;
}

@Injectable()
export class PreciosService {
  constructor(
    @InjectRepository(PrecioEspecial)
    private repo: Repository<PrecioEspecial>,
    private dataSource: DataSource,
    private tenantService: TenantService,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async crear(dto: CreatePrecioDto) {
    const empresaId = this.tenantService.getEmpresaId();
    return this.repo.save(this.repo.create({
      ...dto,
      empresaId,
      vigenciaDesde: dto.vigenciaDesde ? new Date(dto.vigenciaDesde) : undefined,
      vigenciaHasta: dto.vigenciaHasta ? new Date(dto.vigenciaHasta) : undefined,
    }));
  }

  async listar(filtro: { clienteId?: number; productoId?: number; tier?: TierPrecio }) {
    const empresaId = this.tenantService.getEmpresaId();
    const qb = this.repo.createQueryBuilder('p')
      .where('p.empresaId = :eid', { eid: empresaId })
      .andWhere('p.isActive = true');
    if (filtro.clienteId)  qb.andWhere('(p.clienteId = :cid OR p.clienteId IS NULL)', { cid: filtro.clienteId });
    if (filtro.productoId) qb.andWhere('p.productoId = :pid', { pid: filtro.productoId });
    if (filtro.tier)       qb.andWhere('p.tier = :tier', { tier: filtro.tier });
    return qb.orderBy('p.clienteId', 'DESC').addOrderBy('p.productoId', 'ASC').getMany();
  }

  async eliminar(id: number) {
    const p = await this.repo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId() } });
    if (!p) throw new NotFoundException(`Precio especial #${id} no encontrado`);
    await this.repo.update(id, { isActive: false });
    return { message: 'Precio especial eliminado' };
  }

  // ── Calcular precio para un producto + cliente ───────────────────────────────

  async calcularPrecio(productoId: number, clienteId?: number, cantidad = 1): Promise<{
    precioBase: number;
    precioFinal: number;
    descuento: number;
    origen: string;
  }> {
    const hoy = fechaHoyRD();
    const empresaId = this.tenantService.getEmpresaId();

    // Obtener precio base del producto
    const prod = await this.dataSource.query<{ precio: string }[]>(
      `SELECT precio::text FROM productos WHERE id = $1 AND "empresaId" = $2`,
      [productoId, empresaId],
    );
    const precioBase = Number(prod[0]?.precio ?? 0);

    // Buscar precio especial con prioridad: cliente específico > tier > global
    let precioEspecial: PrecioEspecial | null = null;

    if (clienteId) {
      // 1. Precio específico para este cliente
      precioEspecial = await this.repo
        .createQueryBuilder('p')
        .where('p.empresaId = :eid', { eid: empresaId })
        .andWhere('p.isActive = true AND p.productoId = :pid AND p.clienteId = :cid', {
          pid: productoId, cid: clienteId,
        })
        .andWhere('(p.vigenciaDesde IS NULL OR p.vigenciaDesde <= :hoy)', { hoy })
        .andWhere('(p.vigenciaHasta IS NULL OR p.vigenciaHasta >= :hoy)', { hoy })
        .orderBy('p.createdAt', 'DESC')
        .getOne();

      if (!precioEspecial) {
        // 2. Buscar tier del cliente y aplicar su precio
        const tiersRows = await this.dataSource.query<{ tier: string }[]>(
          `SELECT DISTINCT p.tier FROM precios_especiales p
           WHERE p."empresaId" = $1 AND p."clienteId" = $2 AND p."isActive" = true AND p.tier IS NOT NULL`,
          [empresaId, clienteId],
        );
        if (tiersRows.length > 0) {
          precioEspecial = await this.repo
            .createQueryBuilder('p')
            .where('p.empresaId = :eid', { eid: empresaId })
            .andWhere('p.isActive = true AND p.productoId = :pid AND p.tier = :tier AND p.clienteId IS NULL', {
              pid: productoId, tier: tiersRows[0].tier,
            })
            .andWhere('(p.vigenciaDesde IS NULL OR p.vigenciaDesde <= :hoy)', { hoy })
            .andWhere('(p.vigenciaHasta IS NULL OR p.vigenciaHasta >= :hoy)', { hoy })
            .getOne();
        }
      }
    }

    // 3. Precio global sin cliente (aplica a todos)
    if (!precioEspecial) {
      precioEspecial = await this.repo
        .createQueryBuilder('p')
        .where('p.empresaId = :eid', { eid: empresaId })
        .andWhere('p.isActive = true AND p.productoId = :pid AND p.clienteId IS NULL AND p.tier IS NULL', {
          pid: productoId,
        })
        .andWhere('(p.vigenciaDesde IS NULL OR p.vigenciaDesde <= :hoy)', { hoy })
        .andWhere('(p.vigenciaHasta IS NULL OR p.vigenciaHasta >= :hoy)', { hoy })
        .getOne();
    }

    if (!precioEspecial) {
      return { precioBase, precioFinal: precioBase, descuento: 0, origen: 'precio_base' };
    }

    let precioFinal: number;
    let descuento: number;
    let origen: string;

    if (precioEspecial.precioFijo !== null && precioEspecial.precioFijo !== undefined) {
      precioFinal = Number(precioEspecial.precioFijo);
      descuento   = precioBase - precioFinal;
      origen      = precioEspecial.clienteId ? `cliente_${precioEspecial.clienteId}` : precioEspecial.tier ?? 'global';
    } else if (precioEspecial.descuentoPorcentaje !== null && precioEspecial.descuentoPorcentaje !== undefined) {
      descuento   = precioBase * Number(precioEspecial.descuentoPorcentaje) / 100;
      precioFinal = precioBase - descuento;
      origen      = `descuento_${precioEspecial.descuentoPorcentaje}%`;
    } else {
      return { precioBase, precioFinal: precioBase, descuento: 0, origen: 'precio_base' };
    }

    return {
      precioBase,
      precioFinal: Number(precioFinal.toFixed(2)),
      descuento:   Number(descuento.toFixed(2)),
      origen,
    };
  }

  async calcularMultiples(productoIds: number[], clienteId?: number) {
    return Promise.all(productoIds.map(id => this.calcularPrecio(id, clienteId)));
  }
}
