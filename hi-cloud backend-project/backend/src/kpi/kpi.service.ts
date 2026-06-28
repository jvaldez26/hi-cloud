import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Factura, FacturaEstado } from '../facturas/entities/factura.entity';
import { Compra } from '../compras/entities/compra.entity';
import { CuentaPorCobrar } from '../cxc/entities/cuenta-por-cobrar.entity';
import { CuentaPorPagar } from '../cxp/entities/cuenta-por-pagar.entity';
import { Empleado } from '../nomina/entities/empleado.entity';
import { Lead } from '../crm/entities/lead.entity';
import { Producto } from '../productos/entities/producto.entity';
import { Gasto } from '../gastos/entities/gasto.entity';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class KpiService {
  constructor(
    @InjectRepository(Factura)          private factRepo: Repository<Factura>,
    @InjectRepository(Compra)           private compraRepo: Repository<Compra>,
    @InjectRepository(CuentaPorCobrar)  private cxcRepo: Repository<CuentaPorCobrar>,
    @InjectRepository(CuentaPorPagar)   private cxpRepo: Repository<CuentaPorPagar>,
    @InjectRepository(Empleado)         private empRepo: Repository<Empleado>,
    @InjectRepository(Lead)             private leadRepo: Repository<Lead>,
    @InjectRepository(Producto)         private prodRepo: Repository<Producto>,
    @InjectRepository(Gasto)            private gastoRepo: Repository<Gasto>,
    private tenantService: TenantService,
  ) {}

  private periodoActual() {
    const hoy   = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const fin    = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
    const inicioAnio = new Date(hoy.getFullYear(), 0, 1);
    return { hoy, inicio, fin, inicioAnio };
  }

  async getKpis() {
    const { hoy, inicio, fin, inicioAnio } = this.periodoActual();
    const eid = this.tenantService.getEmpresaId();

    const [
      ventasMes, ventasAnio,
      comprasMes,
      cxcPendiente, cxpPendiente,
      cxcVencida, cxpVencida,
      empleadosActivos,
      leadsPendientes, leadsConvertidos,
      productosStockBajo,
      gastosMes,
    ] = await Promise.all([
      // Ventas del mes
      this.factRepo.createQueryBuilder('f')
        .select('COALESCE(SUM(f.total),0)', 'total')
        .addSelect('COUNT(*)', 'cantidad')
        .where('f.empresaId = :eid', { eid })
        .andWhere('f.fecha BETWEEN :i AND :f', { i: inicio, f: fin })
        .andWhere('f.estado IN (:...e)', { e: ['emitida','pagada'] })
        .andWhere('f.isActive = true')
        .getRawOne<{ total: string; cantidad: string }>(),

      // Ventas del año
      this.factRepo.createQueryBuilder('f')
        .select('COALESCE(SUM(f.total),0)', 'total')
        .where('f.empresaId = :eid', { eid })
        .andWhere('f.fecha >= :ia', { ia: inicioAnio })
        .andWhere('f.estado IN (:...e)', { e: ['emitida','pagada'] })
        .andWhere('f.isActive = true')
        .getRawOne<{ total: string }>(),

      // Compras del mes
      this.compraRepo.createQueryBuilder('c')
        .select('COALESCE(SUM(c.total),0)', 'total')
        .where('c.empresaId = :eid', { eid })
        .andWhere('c.fecha BETWEEN :i AND :f', { i: inicio, f: fin })
        .andWhere('c.estado IN (:...e)', { e: ['recibida','pagada'] })
        .andWhere('c.isActive = true')
        .getRawOne<{ total: string }>(),

      // CxC pendiente total
      this.cxcRepo.createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPendiente),0)', 'total')
        .where('c.empresaId = :eid', { eid })
        .andWhere('c.estado IN (:...e)', { e: ['pendiente','pagada_parcial'] })
        .andWhere('c.isActive = true')
        .getRawOne<{ total: string }>(),

      // CxP pendiente total
      this.cxpRepo.createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPendiente),0)', 'total')
        .where('c.empresaId = :eid', { eid })
        .andWhere('c.estado IN (:...e)', { e: ['pendiente','pagada_parcial'] })
        .andWhere('c.isActive = true')
        .getRawOne<{ total: string }>(),

      // CxC vencida
      this.cxcRepo.createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPendiente),0)', 'total')
        .where('c.empresaId = :eid', { eid })
        .andWhere('c.estado = :e', { e: 'vencida' })
        .andWhere('c.isActive = true')
        .getRawOne<{ total: string }>(),

      // CxP vencida
      this.cxpRepo.createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPendiente),0)', 'total')
        .where('c.empresaId = :eid', { eid })
        .andWhere('c.estado = :e', { e: 'vencida' })
        .andWhere('c.isActive = true')
        .getRawOne<{ total: string }>(),

      // Empleados activos
      this.empRepo.count({ where: { empresaId: eid, isActive: true, estado: 'activo' as any } }),

      // Leads pendientes
      this.leadRepo.count({ where: { empresaId: eid, isActive: true, estado: 'nuevo' as any } }),

      // Leads convertidos este mes
      this.leadRepo.createQueryBuilder('l')
        .where('l.empresaId = :eid', { eid })
        .andWhere("l.estado = 'convertido'")
        .andWhere('l.updatedAt BETWEEN :i AND :f', { i: inicio, f: fin })
        .andWhere('l.isActive = true')
        .getCount(),

      // Productos con stock bajo
      this.prodRepo.createQueryBuilder('p')
        .where('p.empresaId = :eid', { eid })
        .andWhere('p.stock <= p."stockMinimo"')
        .andWhere('p.isActive = true')
        .getCount(),

      // Gastos del mes
      this.gastoRepo.createQueryBuilder('g')
        .select('COALESCE(SUM(g.total),0)', 'total')
        .where('g.empresaId = :eid', { eid })
        .andWhere('g.fecha BETWEEN :i AND :f', { i: inicio, f: fin })
        .andWhere('g.isActive = true')
        .getRawOne<{ total: string }>(),
    ]);

    const ventasMesVal  = Number(ventasMes?.total ?? 0);
    const comprasMesVal = Number(comprasMes?.total ?? 0);
    const gastosMesVal  = Number(gastosMes?.total ?? 0);
    const utilidadBruta = ventasMesVal - comprasMesVal - gastosMesVal;
    const margenBruto   = ventasMesVal > 0 ? +((utilidadBruta / ventasMesVal) * 100).toFixed(1) : 0;

    // Top 5 clientes del mes
    const topClientes = await this.factRepo
      .createQueryBuilder('f')
      .select(['f.clienteId', 'SUM(f.total) AS total', 'COUNT(*) AS cantidad'])
      .addSelect(['c.nombre'])
      .leftJoin('f.cliente', 'c')
      .where('f.empresaId = :eid', { eid })
      .andWhere('f.fecha BETWEEN :i AND :f', { i: inicio, f: fin })
      .andWhere('f.estado IN (:...e)', { e: ['emitida','pagada'] })
      .andWhere('f.isActive = true')
      .groupBy('f.clienteId, c.nombre')
      .orderBy('SUM(f.total)', 'DESC')
      .limit(5)
      .getRawMany();

    // Ventas por mes (últimos 6)
    const ventasPorMes = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - (5 - i), 1);
        const h = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
        return this.factRepo
          .createQueryBuilder('f')
          .select('COALESCE(SUM(f.total),0)', 'total')
          .where('f.empresaId = :eid', { eid })
          .andWhere('f.fecha BETWEEN :d AND :h', { d, h })
          .andWhere('f.estado IN (:...e)', { e: ['emitida','pagada'] })
          .andWhere('f.isActive = true')
          .getRawOne<{ total: string }>()
          .then(r => ({
            label: d.toLocaleDateString('es-DO', { month: 'short', year: '2-digit' }),
            ventas: Number(r?.total ?? 0),
          }));
      }),
    );

    return {
      generadoEn: hoy.toISOString(),
      ventas: {
        mes:       ventasMesVal,
        anio:      Number(ventasAnio?.total ?? 0),
        cantidad:  Number(ventasMes?.cantidad ?? 0),
        tendencia: ventasPorMes,
      },
      compras: {
        mes: comprasMesVal,
      },
      gastos: {
        mes: gastosMesVal,
      },
      utilidad: {
        bruta:  utilidadBruta,
        margen: margenBruto,
      },
      cxc: {
        pendiente: Number(cxcPendiente?.total ?? 0),
        vencida:   Number(cxcVencida?.total   ?? 0),
      },
      cxp: {
        pendiente: Number(cxpPendiente?.total ?? 0),
        vencida:   Number(cxpVencida?.total   ?? 0),
      },
      rrhh: {
        empleadosActivos,
      },
      crm: {
        leadsPendientes,
        leadsConvertidosMes: leadsConvertidos,
        tasaConversion: (leadsPendientes + leadsConvertidos) > 0
          ? +((leadsConvertidos / (leadsPendientes + leadsConvertidos)) * 100).toFixed(1)
          : 0,
      },
      inventario: {
        productosStockBajo,
      },
      topClientes: topClientes.map(c => ({
        nombre:   c.c_nombre ?? `Cliente #${c.f_clienteId}`,
        total:    Number(c.total),
        cantidad: Number(c.cantidad),
      })),
    };
  }
}
