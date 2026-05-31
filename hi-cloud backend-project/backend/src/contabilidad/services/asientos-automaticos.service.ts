import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { generarNumeroSecuencial } from '../../common/utils/generar-numero.util';
import { CuentaContable } from '../entities/cuenta-contable.entity';
import { AsientoContable, TipoOrigenAsiento, EstadoAsiento } from '../entities/asiento-contable.entity';
import { AsientoLinea } from '../entities/asiento-linea.entity';
import { TenantService } from '../../tenant/tenant.service';

// Códigos del plan de cuentas dominicano
const COD = {
  CLIENTES:           '1.1.2.01',
  BANCOS:             '1.1.1.03',
  CAJA:               '1.1.1.02',
  INVENTARIO:         '1.1.3.01',
  ITBIS_CREDITO:      '1.1.4.01',
  PROVEEDORES:        '2.1.1.01',
  ITBIS_POR_PAGAR:    '2.1.2.01',
  VENTAS:             '4.1.1.01',
  SUELDOS:            '6.1.1.01',
  TSS_PATRONAL:       '6.1.1.02',
  SUELDOS_X_PAGAR:    '2.1.3.01',
  TSS_X_PAGAR:        '2.1.3.02',
  ISR_X_PAGAR:        '2.1.2.02',
  ITBIS_CREDITO_COMPRAS: '1.1.4.01',
  ANTICIPOS_CLIENTES:  '2.1.5.01',  // Pasivo corriente — anticipos recibidos
  GANANCIA_CAMBIARIA:  '4.1.3.01',  // Ingreso — ganancia en diferencia cambiaria
  PERDIDA_CAMBIARIA:   '6.1.5.01',  // Gasto — pérdida en diferencia cambiaria
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
    @InjectDataSource() private dataSource: DataSource,
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
    return generarNumeroSecuencial(
      this.dataSource,
      'asientos_contables',
      'numero',
      '^ASI-[0-9]+$',
      'ASI-',
      5,
      empresaId ?? 0,
    );
  }

  private async _crearAsientoContabilizado(params: {
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
      await this._crearAsientoContabilizado({
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
      await this._crearAsientoContabilizado({
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
      await this._crearAsientoContabilizado({
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
  // Cobro CxC en moneda extranjera con diferencia cambiaria
  // DÉBITO BANCOS     = montoME * tasaHoy (DOP reales recibidos)
  // CRÉDITO CLIENTES  = montoME * tasaOrig (DOP registrados al crear CxC)
  // Diferencia → GANANCIA_CAMBIARIA o PÉRDIDA_CAMBIARIA
  // ──────────────────────────────────────────────────────────────────

  async asientoCobroME(
    montoME:  number,
    moneda:   string,
    tasaHoy:  number,
    tasaOrig: number,
    cxcId:    number,
    userId:   number,
  ): Promise<void> {
    const montoReal = parseFloat((montoME * tasaHoy).toFixed(2));
    const montoLib  = parseFloat((montoME * tasaOrig).toFixed(2));
    const diff      = parseFloat((montoReal - montoLib).toFixed(2));

    const lineas: { codigo: string; descripcion: string; debe: number; haber: number }[] = [
      { codigo: COD.BANCOS,   descripcion: `Cobro ${moneda} CxC #${cxcId}`,   debe: montoReal, haber: 0        },
      { codigo: COD.CLIENTES, descripcion: `Cancelación CxC #${cxcId}`,        debe: 0,         haber: montoLib },
    ];

    if (diff > 0.005) {
      lineas.push({ codigo: COD.GANANCIA_CAMBIARIA, descripcion: `Ganancia cambiaria CxC #${cxcId} (${moneda})`, debe: 0,    haber: diff });
    } else if (diff < -0.005) {
      lineas.push({ codigo: COD.PERDIDA_CAMBIARIA,  descripcion: `Pérdida cambiaria CxC #${cxcId} (${moneda})`,  debe: -diff, haber: 0   });
    }

    try {
      await this._crearAsientoContabilizado({
        descripcion:     `Cobro ${moneda} CxC #${cxcId}`,
        tipoOrigen:      TipoOrigenAsiento.COBRO,
        referenciaId:    cxcId,
        referenciaFolio: `CXC-${cxcId}`,
        userId,
        lineas,
      });
      this.logger.log(`Asiento cobro ME CxC #${cxcId} — diff cambiaria: ${diff} RD$`);
    } catch (err) {
      this.logger.error(`Error asiento cobro ME CxC #${cxcId}: ${(err as Error).message}`);
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
      await this._crearAsientoContabilizado({
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
      await this._crearAsientoContabilizado({
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
      await this._crearAsientoContabilizado({
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
      await this._crearAsientoContabilizado({
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
      await this._crearAsientoContabilizado({
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

      await this._crearAsientoContabilizado({
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

  // ──────────────────────────────────────────────────────────────────
  // Anticipo recibido de cliente → Caja/Banco / Anticipos de Clientes
  // Efectivo: DÉBITO Caja. Resto: DÉBITO Bancos.
  // CRÉDITO: Anticipos de Clientes (pasivo 2.1.5.01)
  // Retorna el id del asiento generado, o null si falló.
  // ──────────────────────────────────────────────────────────────────

  async asientoAnticipo(
    monto:      number,
    anticipoId: number,
    tipoPago:   string,
    userId:     number,
  ): Promise<number | null> {
    const cuentaDebito = tipoPago === 'efectivo' ? COD.CAJA : COD.BANCOS;
    try {
      const asiento = await this._crearAsientoContabilizado({
        descripcion:     `Anticipo recibido #${anticipoId}`,
        tipoOrigen:      TipoOrigenAsiento.COBRO,
        referenciaId:    anticipoId,
        referenciaFolio: `ANT-${anticipoId}`,
        userId,
        lineas: [
          { codigo: cuentaDebito,            descripcion: `Ingreso anticipo #${anticipoId}`,           debe: monto, haber: 0    },
          { codigo: COD.ANTICIPOS_CLIENTES,  descripcion: `Anticipo recibido de cliente #${anticipoId}`, debe: 0,   haber: monto },
        ],
      });
      this.logger.log(`Asiento anticipo #${anticipoId} generado`);
      return asiento?.id ?? null;
    } catch (err) {
      this.logger.error(`Error asiento anticipo #${anticipoId}: ${(err as Error).message}`);
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Aplicación de anticipo a CxC → Anticipos de Clientes / Clientes
  // DÉBITO: Anticipos de Clientes (libera el pasivo)
  // CRÉDITO: Clientes (reduce la cuenta por cobrar)
  // ──────────────────────────────────────────────────────────────────

  async asientoAplicarAnticipo(
    monto:      number,
    anticipoId: number,
    cxcId:      number,
    userId:     number,
  ): Promise<void> {
    try {
      await this._crearAsientoContabilizado({
        descripcion:     `Aplicación anticipo #${anticipoId} → CxC #${cxcId}`,
        tipoOrigen:      TipoOrigenAsiento.COBRO,
        referenciaId:    anticipoId,
        referenciaFolio: `ANT-${anticipoId}`,
        userId,
        lineas: [
          { codigo: COD.ANTICIPOS_CLIENTES, descripcion: `Aplicar anticipo #${anticipoId}`,   debe: monto, haber: 0    },
          { codigo: COD.CLIENTES,           descripcion: `Abono CxC #${cxcId} por anticipo`,  debe: 0,     haber: monto },
        ],
      });
      this.logger.log(`Asiento aplicación anticipo #${anticipoId} → CxC #${cxcId}`);
    } catch (err) {
      this.logger.error(`Error asiento aplicar anticipo #${anticipoId}: ${(err as Error).message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Reversión de cobro (anulación de recibo) → Clientes / Bancos
  // Inverso del asientoCobro: DÉBITO Clientes, CRÉDITO Bancos
  // ──────────────────────────────────────────────────────────────────

  async asientoReversion(
    monto:     number,
    cxcId:     number,
    reciboId:  number,
    tipo:      string,
    userId:    number,
  ): Promise<void> {
    try {
      await this._crearAsientoContabilizado({
        descripcion:     `Reversión ${tipo} #${reciboId} — CxC #${cxcId}`,
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    reciboId,
        referenciaFolio: `REV-${reciboId}`,
        userId,
        lineas: [
          { codigo: COD.CLIENTES, descripcion: `Reversar cobro CxC #${cxcId}`, debe: monto, haber: 0    },
          { codigo: COD.BANCOS,   descripcion: `Reversar ingreso ${tipo} #${reciboId}`, debe: 0, haber: monto },
        ],
      });
      this.logger.log(`Asiento reversión ${tipo} #${reciboId} generado`);
    } catch (err) {
      this.logger.error(`Error asiento reversión ${tipo} #${reciboId}: ${(err as Error).message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Manufactura — acceso público al builder genérico
  // Permite a ManufacturaService crear asientos con cuentas arbitrarias
  // sin duplicar la lógica de numeración y persistencia.
  // ──────────────────────────────────────────────────────────────────

  /**
   * Crea un asiento contabilizado con líneas de cuentas arbitrarias.
   * Retorna el AsientoContable creado, o null si alguna cuenta no existe.
   * Úsalo desde módulos que generan asientos automáticos fuera de contabilidad.
   */
  async crearAsientoContabilizado(params: {
    descripcion: string;
    tipoOrigen: TipoOrigenAsiento;
    referenciaId: number;
    referenciaFolio: string;
    userId: number;
    lineas: Array<{ codigo: string; descripcion: string; debe: number; haber: number }>;
  }): Promise<import('../entities/asiento-contable.entity').AsientoContable | null> {
    return this._crearAsientoContabilizado(params);
  }
}
