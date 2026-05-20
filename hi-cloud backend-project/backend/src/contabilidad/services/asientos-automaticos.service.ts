import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CuentaContable } from '../entities/cuenta-contable.entity';
import { AsientoContable, TipoOrigenAsiento, EstadoAsiento } from '../entities/asiento-contable.entity';
import { AsientoLinea } from '../entities/asiento-linea.entity';
import { TenantService } from '../../tenant/tenant.service';

// Códigos del plan de cuentas dominicano
const COD = {
  CLIENTES:        '1.1.2.01',
  BANCOS:          '1.1.1.03',
  CAJA:            '1.1.1.02',
  INVENTARIO:      '1.1.3.01',
  ITBIS_CREDITO:   '1.1.4.01',
  PROVEEDORES:     '2.1.1.01',
  ITBIS_POR_PAGAR: '2.1.2.01',
  VENTAS:          '4.1.1.01',
  SUELDOS:         '6.1.1.01',
  TSS_PATRONAL:    '6.1.1.02',
  SUELDOS_X_PAGAR: '2.1.3.01',
  TSS_X_PAGAR:     '2.1.3.02',
  ISR_X_PAGAR:     '2.1.2.02',
  ITBIS_CREDITO_COMPRAS: '1.1.4.01',
} as const;

@Injectable()
export class AsientosAutomaticosService {
  private readonly logger = new Logger(AsientosAutomaticosService.name);

  constructor(
    @InjectRepository(CuentaContable)
    private cuentaRepository:  Repository<CuentaContable>,
    @InjectRepository(AsientoContable)
    private asientoRepository: Repository<AsientoContable>,
    @InjectRepository(AsientoLinea)
    private lineaRepository:   Repository<AsientoLinea>,
    private tenantService:     TenantService,
  ) {}

  private get eid(): number | undefined {
    try { return this.tenantService.getEmpresaId(); } catch { return undefined; }
  }

  // ──────────────────────────────────────────────────────────────────
  // Helpers privados
  // ──────────────────────────────────────────────────────────────────

  private async getCuenta(codigo: string, empresaId?: number): Promise<CuentaContable | null> {
    const where: any = { codigo, isActive: true };
    if (empresaId) where.empresaId = empresaId;
    return this.cuentaRepository.findOne({ where });
  }

  private async generarNumero(empresaId?: number): Promise<string> {
    const qb = this.asientoRepository.createQueryBuilder('a')
      .select(`MAX(CASE WHEN a.numero ~ '^ASI-[0-9]+$' THEN CAST(SUBSTRING(a.numero FROM 5) AS INTEGER) ELSE 100 END)`, 'maxNum')
      .where('a.isActive = :active', { active: true });
    if (empresaId) qb.andWhere('a.empresaId = :eid', { eid: empresaId });
    const res = await qb.getRawOne<{ maxNum: number | null }>();
    return `ASI-${Math.max(101, (res?.maxNum ?? 100) + 1)}`;
  }

  private async crearAsientoContabilizado(params: {
    descripcion: string;
    tipoOrigen: TipoOrigenAsiento;
    referenciaId: number;
    referenciaFolio: string;
    userId: number;
    lineas: Array<{ codigo: string; descripcion: string; debe: number; haber: number }>;
  }): Promise<AsientoContable | null> {
    const lineasResueltas: { cuenta: CuentaContable; descripcion: string; debe: number; haber: number }[] = [];

    for (const l of params.lineas) {
      const cuenta = await this.getCuenta(l.codigo, this.eid);
      if (!cuenta) {
        this.logger.warn(`Cuenta ${l.codigo} no encontrada — asiento omitido`);
        return null;
      }
      lineasResueltas.push({ cuenta, ...l });
    }

    const totalDebe  = lineasResueltas.reduce((s, l) => s + l.debe,  0);
    const totalHaber = lineasResueltas.reduce((s, l) => s + l.haber, 0);

    const numero  = await this.generarNumero(this.eid);
    const asiento = await this.asientoRepository.save(
      this.asientoRepository.create({
        ...(this.eid ? { empresaId: this.eid } : {}),
        numero,
        fecha:           new Date(),
        descripcion:     params.descripcion,
        tipoOrigen:      params.tipoOrigen,
        referenciaId:    params.referenciaId,
        referenciaFolio: params.referenciaFolio,
        estado:          EstadoAsiento.CONTABILIZADO,
        totalDebe:       Number(totalDebe.toFixed(2)),
        totalHaber:      Number(totalHaber.toFixed(2)),
        userId:          params.userId,
      }),
    );

    await this.lineaRepository.save(
      this.lineaRepository.create(
        lineasResueltas.map((l) => ({
          asientoId:        asiento.id,
          cuentaContableId: l.cuenta.id,
          descripcion:      l.descripcion,
          debe:             l.debe,
          haber:            l.haber,
        })),
      ),
    );

    return asiento;
  }

  // ──────────────────────────────────────────────────────────────────
  // Factura emitida → Clientes / Ventas / ITBIS por Pagar
  // ──────────────────────────────────────────────────────────────────

  async asientoFacturaEmitida(
    facturaId: number,
    total: number,
    subtotal: number,
    iva: number,
    folio: string,
    userId: number,
  ): Promise<void> {
    try {
      await this.crearAsientoContabilizado({
        descripcion:     `Venta según factura ${folio}`,
        tipoOrigen:      TipoOrigenAsiento.FACTURA,
        referenciaId:    facturaId,
        referenciaFolio: folio,
        userId,
        lineas: [
          { codigo: COD.CLIENTES,        descripcion: `Cta. por cobrar ${folio}`, debe: total,    haber: 0 },
          { codigo: COD.VENTAS,          descripcion: `Ingreso por venta ${folio}`, debe: 0,      haber: subtotal },
          { codigo: COD.ITBIS_POR_PAGAR, descripcion: `ITBIS débito fiscal ${folio}`, debe: 0,   haber: iva },
        ],
      });
      this.logger.log(`Asiento factura ${folio} generado`);
    } catch (err) {
      this.logger.error(`Error asiento factura ${folio}: ${(err as Error).message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Compra recibida → Inventario / ITBIS Crédito / Proveedores
  // ──────────────────────────────────────────────────────────────────

  async asientoCompraRecibida(
    compraId: number,
    total: number,
    subtotal: number,
    itbis: number,
    folio: string,
    userId: number,
  ): Promise<void> {
    try {
      await this.crearAsientoContabilizado({
        descripcion:     `Compra según orden ${folio}`,
        tipoOrigen:      TipoOrigenAsiento.COMPRA,
        referenciaId:    compraId,
        referenciaFolio: folio,
        userId,
        lineas: [
          { codigo: COD.INVENTARIO,    descripcion: `Mercancía recibida ${folio}`, debe: subtotal, haber: 0 },
          { codigo: COD.ITBIS_CREDITO, descripcion: `ITBIS crédito fiscal ${folio}`, debe: itbis, haber: 0 },
          { codigo: COD.PROVEEDORES,   descripcion: `CxP proveedor ${folio}`,      debe: 0,       haber: total },
        ],
      });
      this.logger.log(`Asiento compra ${folio} generado`);
    } catch (err) {
      this.logger.error(`Error asiento compra ${folio}: ${(err as Error).message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Cobro recibido (CxC) → Bancos / Clientes
  // ──────────────────────────────────────────────────────────────────

  async asientoCobro(
    monto: number,
    cxcId: number,
    userId: number,
  ): Promise<void> {
    try {
      await this.crearAsientoContabilizado({
        descripcion:     `Cobro CxC #${cxcId}`,
        tipoOrigen:      TipoOrigenAsiento.COBRO,
        referenciaId:    cxcId,
        referenciaFolio: `CXC-${cxcId}`,
        userId,
        lineas: [
          { codigo: COD.BANCOS,    descripcion: `Cobro recibido CxC #${cxcId}`, debe: monto, haber: 0 },
          { codigo: COD.CLIENTES,  descripcion: `Cancelación CxC #${cxcId}`,    debe: 0,     haber: monto },
        ],
      });
      this.logger.log(`Asiento cobro CxC #${cxcId} generado`);
    } catch (err) {
      this.logger.error(`Error asiento cobro CxC #${cxcId}: ${(err as Error).message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Recibo de cobro sin CxC → Caja/Banco / Clientes
  // Para efectivo: DÉBITO Caja. Para el resto: DÉBITO Bancos.
  // ──────────────────────────────────────────────────────────────────

  async asientoRecibo(
    monto:     number,
    reciboId:  number,
    metodoPago: string,
    userId:    number,
  ): Promise<void> {
    const cuentaDebito = metodoPago === 'efectivo' ? COD.CAJA : COD.BANCOS;
    try {
      await this.crearAsientoContabilizado({
        descripcion:     `Recibo de cobro #${reciboId}`,
        tipoOrigen:      TipoOrigenAsiento.COBRO,
        referenciaId:    reciboId,
        referenciaFolio: `REC-${reciboId}`,
        userId,
        lineas: [
          { codigo: cuentaDebito, descripcion: `Ingreso recibo #${reciboId}`, debe: monto, haber: 0    },
          { codigo: COD.CLIENTES, descripcion: `Cobro recibido REC-${reciboId}`, debe: 0,  haber: monto },
        ],
      });
      this.logger.log(`Asiento recibo de cobro #${reciboId} generado`);
    } catch (err) {
      this.logger.error(`Error asiento recibo #${reciboId}: ${(err as Error).message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Pago realizado (CxP) → Proveedores / Bancos
  // ──────────────────────────────────────────────────────────────────

  async asientoPago(
    monto: number,
    cxpId: number,
    userId: number,
  ): Promise<void> {
    try {
      await this.crearAsientoContabilizado({
        descripcion:     `Pago CxP #${cxpId}`,
        tipoOrigen:      TipoOrigenAsiento.PAGO,
        referenciaId:    cxpId,
        referenciaFolio: `CXP-${cxpId}`,
        userId,
        lineas: [
          { codigo: COD.PROVEEDORES, descripcion: `Cancelación CxP #${cxpId}`,    debe: monto, haber: 0 },
          { codigo: COD.BANCOS,      descripcion: `Pago realizado CxP #${cxpId}`, debe: 0,     haber: monto },
        ],
      });
      this.logger.log(`Asiento pago CxP #${cxpId} generado`);
    } catch (err) {
      this.logger.error(`Error asiento pago CxP #${cxpId}: ${(err as Error).message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Nómina pagada → Sueldos / TSS Patronal / Sueldos x Pagar / TSS x Pagar / ISR
  // ──────────────────────────────────────────────────────────────────

  async asientoNomina(
    periodoId: number,
    totalBruto: number,
    totalNeto: number,
    totalTSSEmpleados: number,
    totalISR: number,
    totalTSSPatronal: number,
    periodo: string,
    userId: number,
  ): Promise<void> {
    try {
      const costoTotal = totalBruto + totalTSSPatronal;
      await this.crearAsientoContabilizado({
        descripcion:     `Nómina ${periodo}`,
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    periodoId,
        referenciaFolio: `NOM-${periodo}`,
        userId,
        lineas: [
          { codigo: COD.SUELDOS,         descripcion: `Sueldos nómina ${periodo}`,        debe: totalBruto,      haber: 0 },
          { codigo: COD.TSS_PATRONAL,    descripcion: `TSS patronal nómina ${periodo}`,   debe: totalTSSPatronal, haber: 0 },
          { codigo: COD.SUELDOS_X_PAGAR, descripcion: `Neto a pagar nómina ${periodo}`,   debe: 0,               haber: totalNeto },
          { codigo: COD.TSS_X_PAGAR,     descripcion: `TSS empleados nómina ${periodo}`,  debe: 0,               haber: totalTSSEmpleados + totalTSSPatronal },
          { codigo: COD.ISR_X_PAGAR,     descripcion: `ISR retenido nómina ${periodo}`,   debe: 0,               haber: totalISR },
        ].filter((l) => l.debe > 0 || l.haber > 0),
      });
      this.logger.log(`Asiento nómina ${periodo} generado. Costo total: ${costoTotal.toFixed(2)}`);
    } catch (err) {
      this.logger.error(`Error asiento nómina ${periodo}: ${(err as Error).message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Depreciación mensual → Gasto Depreciación / Depreciación Acumulada
  // ──────────────────────────────────────────────────────────────────

  async asientoDepreciacion(
    montoTotal: number,
    periodo: string,
    userId: number,
  ): Promise<void> {
    try {
      await this.crearAsientoContabilizado({
        descripcion:     `Depreciación activos fijos ${periodo}`,
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    0,
        referenciaFolio: `DEP-${periodo}`,
        userId,
        lineas: [
          { codigo: '6.2.1.01', descripcion: `Gasto depreciación ${periodo}`,  debe: montoTotal, haber: 0 },
          { codigo: '1.2.2.01', descripcion: `Depreciación acum. ${periodo}`,  debe: 0, haber: montoTotal },
        ],
      });
      this.logger.log(`Asiento depreciación ${periodo}: ${montoTotal.toFixed(2)}`);
    } catch (err) {
      this.logger.error(`Error asiento depreciación ${periodo}: ${(err as Error).message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Devolución de venta → reversa: Ventas (D) / ITBIS (D) / Clientes (H)
  // ──────────────────────────────────────────────────────────────────

  async asientoDevolucionVenta(
    devolucionId: number,
    total: number,
    subtotal: number,
    iva: number,
    numero: string,
    userId: number,
  ): Promise<void> {
    try {
      await this.crearAsientoContabilizado({
        descripcion:     `Devolución de venta ${numero}`,
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    devolucionId,
        referenciaFolio: numero,
        userId,
        lineas: [
          { codigo: COD.VENTAS,          descripcion: `Reversa venta ${numero}`,   debe: subtotal, haber: 0 },
          { codigo: COD.ITBIS_POR_PAGAR, descripcion: `Reversa ITBIS ${numero}`,   debe: iva,      haber: 0 },
          { codigo: COD.CLIENTES,        descripcion: `Nota crédito ${numero}`,     debe: 0,        haber: total },
        ],
      });
      this.logger.log(`Asiento devolución ${numero} generado`);
    } catch (err) {
      this.logger.error(`Error asiento devolución ${numero}: ${(err as Error).message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Gasto operativo → Gasto (D) + ITBIS Crédito (D) / Bancos (H)
  // ──────────────────────────────────────────────────────────────────

  async asientoGasto(
    gastoId:      number,
    total:        number,
    monto:        number,
    itbis:        number,
    descripcion:  string,
    userId:       number,
    cuentaGasto = '6.1.2.04', // Gastos Generales — puede personalizarse por categoría
  ): Promise<void> {
    try {
      const lineas = [
        { codigo: cuentaGasto,            descripcion, debe: monto, haber: 0 },
        ...(itbis > 0 ? [{ codigo: COD.ITBIS_CREDITO_COMPRAS, descripcion: `ITBIS crédito ${descripcion}`, debe: itbis, haber: 0 }] : []),
        { codigo: COD.BANCOS, descripcion: `Pago ${descripcion}`, debe: 0, haber: total },
      ];

      await this.crearAsientoContabilizado({
        descripcion,
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    gastoId,
        referenciaFolio: `GST-${gastoId}`,
        userId,
        lineas,
      });
      this.logger.log(`Asiento gasto #${gastoId} generado: ${total.toFixed(2)}`);
    } catch (err) {
      this.logger.error(`Error asiento gasto #${gastoId}: ${(err as Error).message}`);
    }
  }
}
