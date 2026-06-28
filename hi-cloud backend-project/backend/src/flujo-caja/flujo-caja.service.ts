import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { CuentaPorCobrar } from '../cxc/entities/cuenta-por-cobrar.entity';
import { CuentaPorPagar } from '../cxp/entities/cuenta-por-pagar.entity';
import { Contrato } from '../contratos/entities/contrato.entity';
import { Gasto } from '../gastos/entities/gasto.entity';
import { TenantService } from '../tenant/tenant.service';

export interface PeriodoFlujoCaja {
  mes:           number;
  anio:          number;
  label:         string;
  // Ingresos
  cobrosEsperados:    number;  // CxC que vencen en el mes
  ingresosContratos:  number;  // Contratos cuya próxima factura es en el mes
  totalIngresos:      number;
  // Egresos
  pagosEsperados:     number;  // CxP que vencen en el mes
  gastosRecurrentes:  number;  // Promedio de gastos del mismo mes
  totalEgresos:       number;
  // Saldo
  flujoBruto:         number;
  saldoAcumulado:     number;
}

const MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

@Injectable()
export class FlujoCajaService {
  constructor(
    @InjectRepository(CuentaPorCobrar) private cxcRepo:      Repository<CuentaPorCobrar>,
    @InjectRepository(CuentaPorPagar)  private cxpRepo:      Repository<CuentaPorPagar>,
    @InjectRepository(Contrato)        private contratoRepo: Repository<Contrato>,
    @InjectRepository(Gasto)           private gastoRepo:    Repository<Gasto>,
    private tenantService: TenantService,
  ) {}

  async getProyeccion(meses = 6, saldoInicial = 0): Promise<{
    periodos: PeriodoFlujoCaja[];
    resumen:  { totalIngresos: number; totalEgresos: number; flujoBruto: number };
  }> {
    const hoy  = new Date();
    const periodos: PeriodoFlujoCaja[] = [];
    let saldoAcumulado = saldoInicial;
    const empresaId = this.tenantService.getEmpresaId();

    for (let i = 0; i < meses; i++) {
      const fecha = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
      const desde = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
      const hasta  = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0, 23, 59, 59);

      // ── Ingresos: CxC que vencen en el período ─────────────────────────
      const cobros = await this.cxcRepo
        .createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPendiente), 0)', 'total')
        .where('c.empresaId = :eid', { eid: empresaId })
        .andWhere('c.fechaVencimiento BETWEEN :d AND :h', { d: desde, h: hasta })
        .andWhere('c.estado IN (:...estados)', { estados: ['pendiente', 'pagada_parcial', 'vencida'] })
        .andWhere('c.isActive = :a', { a: true })
        .getRawOne<{ total: string }>();

      // ── Ingresos: Contratos cuya próxima factura es en el período ───────
      const contratosIngresos = await this.contratoRepo
        .createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoBase + (c.montoBase * c.porcentajeIva / 100)), 0)', 'total')
        .where('c.empresaId = :eid', { eid: empresaId })
        .andWhere('c.proximaFactura BETWEEN :d AND :h', { d: desde, h: hasta })
        .andWhere("c.estado = 'activo'")
        .andWhere('c.isActive = :a', { a: true })
        .getRawOne<{ total: string }>();

      // ── Egresos: CxP que vencen en el período ──────────────────────────
      const pagos = await this.cxpRepo
        .createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPendiente), 0)', 'total')
        .where('c.empresaId = :eid', { eid: empresaId })
        .andWhere('c.fechaVencimiento BETWEEN :d AND :h', { d: desde, h: hasta })
        .andWhere('c.estado IN (:...estados)', { estados: ['pendiente', 'pagada_parcial', 'vencida'] })
        .andWhere('c.isActive = :a', { a: true })
        .getRawOne<{ total: string }>();

      // ── Egresos: Promedio de gastos (del mismo mes año anterior) ────────
      const mesAnterior      = new Date(fecha.getFullYear() - 1, fecha.getMonth(), 1);
      const mesAnteriorHasta = new Date(fecha.getFullYear() - 1, fecha.getMonth() + 1, 0, 23, 59, 59);

      const gastosHistoricos = await this.gastoRepo
        .createQueryBuilder('g')
        .select('COALESCE(SUM(g.total), 0)', 'total')
        .where('g.empresaId = :eid', { eid: empresaId })
        .andWhere('g.fecha BETWEEN :d AND :h', { d: mesAnterior, h: mesAnteriorHasta })
        .andWhere('g.isActive = :a', { a: true })
        .getRawOne<{ total: string }>();

      const cobrosEsperados   = Number(cobros?.total ?? 0);
      const ingresosContratos = Number(contratosIngresos?.total ?? 0);
      const pagosEsperados    = Number(pagos?.total ?? 0);
      const gastosRecurrentes = Number(gastosHistoricos?.total ?? 0);

      const totalIngresos = cobrosEsperados + ingresosContratos;
      const totalEgresos  = pagosEsperados + gastosRecurrentes;
      const flujoBruto    = totalIngresos - totalEgresos;
      saldoAcumulado     += flujoBruto;

      periodos.push({
        mes:   fecha.getMonth() + 1,
        anio:  fecha.getFullYear(),
        label: `${MESES_ES[fecha.getMonth()]} ${fecha.getFullYear()}`,
        cobrosEsperados,
        ingresosContratos,
        totalIngresos,
        pagosEsperados,
        gastosRecurrentes,
        totalEgresos,
        flujoBruto,
        saldoAcumulado,
      });
    }

    const totalIngresos = periodos.reduce((s, p) => s + p.totalIngresos, 0);
    const totalEgresos  = periodos.reduce((s, p) => s + p.totalEgresos, 0);

    return {
      periodos,
      resumen: { totalIngresos, totalEgresos, flujoBruto: totalIngresos - totalEgresos },
    };
  }

  async getFlujoReal(mes: number, anio: number) {
    const desde = new Date(anio, mes - 1, 1);
    const hasta  = new Date(anio, mes, 0, 23, 59, 59);
    const empresaId = this.tenantService.getEmpresaId();

    const [cobrosReales, pagosReales, gastosReales] = await Promise.all([
      this.cxcRepo
        .createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPagado), 0)', 'total')
        .where('c.empresaId = :eid', { eid: empresaId })
        .andWhere('c.fechaVencimiento BETWEEN :d AND :h', { d: desde, h: hasta })
        .andWhere('c.isActive = :a', { a: true })
        .getRawOne<{ total: string }>(),

      this.cxpRepo
        .createQueryBuilder('c')
        .select('COALESCE(SUM(c.montoPagado), 0)', 'total')
        .where('c.empresaId = :eid', { eid: empresaId })
        .andWhere('c.fechaVencimiento BETWEEN :d AND :h', { d: desde, h: hasta })
        .andWhere('c.isActive = :a', { a: true })
        .getRawOne<{ total: string }>(),

      this.gastoRepo
        .createQueryBuilder('g')
        .select('COALESCE(SUM(g.total), 0)', 'total')
        .where('g.empresaId = :eid', { eid: empresaId })
        .andWhere('g.fecha BETWEEN :d AND :h', { d: desde, h: hasta })
        .andWhere('g.isActive = :a', { a: true })
        .getRawOne<{ total: string }>(),
    ]);

    const ingresos = Number(cobrosReales?.total ?? 0);
    const egresos  = Number(pagosReales?.total ?? 0) + Number(gastosReales?.total ?? 0);

    return {
      periodo:  { mes, anio },
      ingresos,
      egresos,
      flujoNeto: ingresos - egresos,
    };
  }
}
