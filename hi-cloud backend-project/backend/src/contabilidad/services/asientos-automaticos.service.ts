import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { generarNumeroSecuencial } from '../../common/utils/generar-numero.util';
import { CuentaContable } from '../entities/cuenta-contable.entity';
import { AsientoContable, TipoOrigenAsiento, EstadoAsiento } from '../entities/asiento-contable.entity';
import { AsientoLinea } from '../entities/asiento-linea.entity';
import { TenantService } from '../../tenant/tenant.service';

// Códigos del plan de cuentas dominicano
const COD = {
  CLIENTES:                '1.1.2.01',
  BANCOS:                  '1.1.1.03',
  CAJA:                    '1.1.1.02',
  INVENTARIO:              '1.1.3.01',
  ITBIS_CREDITO:           '1.1.4.01',
  PROVEEDORES:             '2.1.1.01',
  ITBIS_POR_PAGAR:         '2.1.2.01',
  VENTAS:                  '4.1.1.01',
  SUELDOS:                 '6.1.1.01',
  TSS_PATRONAL:            '6.1.1.02',
  SUELDOS_X_PAGAR:         '2.1.3.01',
  TSS_X_PAGAR:             '2.1.3.02',
  ISR_X_PAGAR:             '2.1.2.02',
  ITBIS_CREDITO_COMPRAS:   '1.1.4.01',
  ANTICIPOS_CLIENTES:      '2.1.5.01',  // Pasivo corriente — anticipos recibidos
  GANANCIA_CAMBIARIA:      '4.1.3.01',  // Ingreso — ganancia en diferencia cambiaria
  PERDIDA_CAMBIARIA:       '6.1.5.01',  // Gasto — pérdida en diferencia cambiaria
  ITBIS_RET_POR_PAGAR:     '2.1.2.03',  // Pasivo — ITBIS retenido por enterar a DGII (E41)
  ISR_RET_POR_PAGAR:       '2.1.2.04',  // Pasivo — ISR retenido por enterar a DGII (E41)
  GASTOS_IMPORT_X_APLICAR: '2.1.6.01',  // Transitoria — gastos de importación hasta llegar la factura del agente
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
    // Una sola query para todas las cuentas del asiento en vez de N findOne
    const codigos = [...new Set(params.lineas.map(l => l.codigo))];
    const whereCondition: any = { codigo: In(codigos), isActive: true };
    if (this.eid) whereCondition.empresaId = this.eid;
    const cuentas = await this.cuentaRepository.find({ where: whereCondition });
    const cuentaMap = new Map(cuentas.map(c => [c.codigo, c]));

    const lineasResueltas: { cuenta: CuentaContable; descripcion: string; debe: number; haber: number }[] = [];
    for (const l of params.lineas) {
      const cuenta = cuentaMap.get(l.codigo);
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
    retenciones?: { retItbis?: number; retIsr?: number; netoCobrar?: number },
  ): Promise<void> {
    const retItbis   = retenciones?.retItbis   ?? 0;
    const retIsr     = retenciones?.retIsr     ?? 0;
    const neto       = retenciones?.netoCobrar ?? total;

    // DR: CxC por el neto (total bruto - retenciones)
    // DR: ITBIS Retenido a Recuperar (si aplica) — activo corriente
    // DR: ISR Retenido a Recuperar (si aplica)   — activo corriente
    // CR: Ventas (subtotal)
    // CR: ITBIS por Pagar (iva total)
    const lineas: { codigo: string; descripcion: string; debe: number; haber: number }[] = [
      { codigo: COD.CLIENTES,        descripcion: `Cta. por cobrar ${folio}`, debe: neto,    haber: 0 },
      { codigo: COD.VENTAS,          descripcion: `Ingreso por venta ${folio}`, debe: 0,     haber: subtotal },
      { codigo: COD.ITBIS_POR_PAGAR, descripcion: `ITBIS débito fiscal ${folio}`, debe: 0,  haber: iva },
    ];
    if (retItbis > 0) {
      lineas.push({ codigo: '1.1.4.02', descripcion: `ITBIS retenido a recuperar ${folio}`, debe: retItbis, haber: 0 });
    }
    if (retIsr > 0) {
      lineas.push({ codigo: '1.1.4.03', descripcion: `ISR retenido a recuperar ${folio}`, debe: retIsr, haber: 0 });
    }

    try {
      await this._crearAsientoContabilizado({
        descripcion:     `Venta según factura ${folio}`,
        tipoOrigen:      TipoOrigenAsiento.FACTURA,
        referenciaId:    facturaId,
        referenciaFolio: folio,
        userId,
        lineas,
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
    retenciones?: { montoItbis?: number; montoIsr?: number; netoPagar?: number },
  ): Promise<void> {
    const retenItbis = retenciones?.montoItbis ?? 0;
    const retenIsr   = retenciones?.montoIsr   ?? 0;
    const neto       = retenciones?.netoPagar  ?? total;
    // ITBIS que queda como crédito fiscal = ITBIS facturado - ITBIS retenido
    const itbisCredito = Number((itbis - retenItbis).toFixed(2));

    const lineas: { codigo: string; descripcion: string; debe: number; haber: number }[] = [
      { codigo: COD.INVENTARIO,    descripcion: `Mercancía recibida ${folio}`, debe: subtotal, haber: 0 },
      { codigo: COD.ITBIS_CREDITO, descripcion: `ITBIS crédito fiscal ${folio}`, debe: itbisCredito > 0 ? itbisCredito : itbis, haber: 0 },
      { codigo: COD.PROVEEDORES,   descripcion: `CxP proveedor ${folio}`,      debe: 0,       haber: neto },
    ];
    if (retenItbis > 0) {
      lineas.push({ codigo: COD.ITBIS_RET_POR_PAGAR, descripcion: `ITBIS retenido E41 ${folio}`, debe: 0, haber: retenItbis });
    }
    if (retenIsr > 0) {
      lineas.push({ codigo: COD.ISR_RET_POR_PAGAR, descripcion: `ISR retenido E41 ${folio}`, debe: 0, haber: retenIsr });
    }

    try {
      await this._crearAsientoContabilizado({
        descripcion:     `Compra según orden ${folio}`,
        tipoOrigen:      TipoOrigenAsiento.COMPRA,
        referenciaId:    compraId,
        referenciaFolio: folio,
        userId,
        lineas,
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
  // Pago CxP en moneda extranjera con diferencia cambiaria
  // CRÉDITO BANCOS    = montoME * tasaHoy (DOP reales pagados)
  // DÉBITO PROVEEDORES = montoME * tasaOrig (DOP en libros al crear CxP)
  // Diferencia → GANANCIA_CAMBIARIA o PÉRDIDA_CAMBIARIA
  // ──────────────────────────────────────────────────────────────────

  async asientoPagoME(
    montoME:  number,
    moneda:   string,
    tasaHoy:  number,
    tasaOrig: number,
    cxpId:    number,
    userId:   number,
  ): Promise<void> {
    const montoReal = parseFloat((montoME * tasaHoy).toFixed(2));
    const montoLib  = parseFloat((montoME * tasaOrig).toFixed(2));
    const diff      = parseFloat((montoLib - montoReal).toFixed(2)); // positivo = ganancia (pagamos menos DOP)

    const lineas: { codigo: string; descripcion: string; debe: number; haber: number }[] = [
      { codigo: COD.PROVEEDORES, descripcion: `Cancelación CxP #${cxpId}`,       debe: montoLib,  haber: 0        },
      { codigo: COD.BANCOS,      descripcion: `Pago ${moneda} CxP #${cxpId}`,    debe: 0,         haber: montoReal },
    ];

    if (diff > 0.005) {
      lineas.push({ codigo: COD.GANANCIA_CAMBIARIA, descripcion: `Ganancia cambiaria CxP #${cxpId} (${moneda})`, debe: 0,    haber: diff });
    } else if (diff < -0.005) {
      lineas.push({ codigo: COD.PERDIDA_CAMBIARIA,  descripcion: `Pérdida cambiaria CxP #${cxpId} (${moneda})`,  debe: -diff, haber: 0   });
    }

    try {
      await this._crearAsientoContabilizado({
        descripcion:     `Pago ${moneda} CxP #${cxpId}`,
        tipoOrigen:      TipoOrigenAsiento.PAGO,
        referenciaId:    cxpId,
        referenciaFolio: `CXP-${cxpId}`,
        userId,
        lineas,
      });
      this.logger.log(`Asiento pago ME CxP #${cxpId} — diff cambiaria: ${diff} RD$`);
    } catch (err) {
      this.logger.error(`Error asiento pago ME CxP #${cxpId}: ${(err as Error).message}`);
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

  // ──────────────────────────────────────────────────────────────────
  // Orden de mantenimiento completada → Gasto (D) / Proveedores (H)
  // ──────────────────────────────────────────────────────────────────

  async asientoMantenimiento(
    ordenId: number,
    costo:   number,
    numero:  string,
    userId:  number,
  ): Promise<void> {
    try {
      await this._crearAsientoContabilizado({
        descripcion:     `Gasto mantenimiento ${numero}`,
        tipoOrigen:      TipoOrigenAsiento.AJUSTE,
        referenciaId:    ordenId,
        referenciaFolio: numero,
        userId,
        lineas: [
          { codigo: '6.1.2.04',       descripcion: `Gasto mantenimiento ${numero}`, debe: costo, haber: 0 },
          { codigo: COD.PROVEEDORES,   descripcion: `CxP mantenimiento ${numero}`,   debe: 0,     haber: costo },
        ],
      });
      this.logger.log(`Asiento mantenimiento ${numero}: ${costo.toFixed(2)}`);
    } catch (err) {
      this.logger.error(`Error asiento mantenimiento ${numero}: ${(err as Error).message}`);
    }
  }

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

  // ──────────────────────────────────────────────────────────────────
  // PRESTAMISTA: Desembolso de préstamo
  // Cartera de Crédito (D) / Bancos o Caja (H)
  // ──────────────────────────────────────────────────────────────────
  async asientoDesembolsoPrestamo(
    prestamoId:   number,
    numero:       string,
    monto:        number,
    formaPago:    string,
    userId:       number,
  ): Promise<void> {
    const cuentaHaber = formaPago === 'efectivo' ? COD.CAJA : COD.BANCOS;
    try {
      await this._crearAsientoContabilizado({
        descripcion:     `Desembolso préstamo ${numero}`,
        tipoOrigen:      TipoOrigenAsiento.PRESTAMISTA,
        referenciaId:    prestamoId,
        referenciaFolio: numero,
        userId,
        lineas: [
          { codigo: '1.1.2.10', descripcion: `Cartera crédito ${numero}`,  debe: monto, haber: 0     },
          { codigo: cuentaHaber, descripcion: `Desembolso préstamo ${numero}`, debe: 0, haber: monto },
        ],
      });
      this.logger.log(`Asiento desembolso préstamo ${numero} generado`);
    } catch (err) {
      this.logger.error(`Error asiento desembolso ${numero}: ${(err as Error).message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // PRESTAMISTA: Pago recibido
  // Bancos/Caja (D) / Cartera de Crédito + Intereses + Mora (H)
  // ──────────────────────────────────────────────────────────────────
  async asientoPagoPrestamo(
    pagoId:         number,
    numeroPago:     string,
    numeroPrestamo: string,
    formaPago:      string,
    capitalAplicado:  number,
    interesAplicado:  number,
    moraAplicada:     number,
    userId:         number,
  ): Promise<void> {
    const totalPago = capitalAplicado + interesAplicado + moraAplicada;
    if (totalPago <= 0) return;
    const cuentaDebito = formaPago === 'efectivo' ? COD.CAJA : COD.BANCOS;
    const lineas: Array<{ codigo: string; descripcion: string; debe: number; haber: number }> = [
      { codigo: cuentaDebito, descripcion: `Pago recibido ${numeroPago}`, debe: totalPago, haber: 0 },
    ];
    if (capitalAplicado > 0)
      lineas.push({ codigo: '1.1.2.10', descripcion: `Capital préstamo ${numeroPrestamo}`, debe: 0, haber: capitalAplicado });
    if (interesAplicado > 0)
      lineas.push({ codigo: '4.1.2.01', descripcion: `Intereses préstamo ${numeroPrestamo}`, debe: 0, haber: interesAplicado });
    if (moraAplicada > 0)
      lineas.push({ codigo: '4.1.2.02', descripcion: `Mora préstamo ${numeroPrestamo}`, debe: 0, haber: moraAplicada });
    try {
      await this._crearAsientoContabilizado({
        descripcion:     `Pago préstamo ${numeroPago} — ${numeroPrestamo}`,
        tipoOrigen:      TipoOrigenAsiento.PRESTAMISTA,
        referenciaId:    pagoId,
        referenciaFolio: numeroPago,
        userId,
        lineas,
      });
      this.logger.log(`Asiento pago ${numeroPago} generado`);
    } catch (err) {
      this.logger.error(`Error asiento pago ${numeroPago}: ${(err as Error).message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Gasto de importación aplicado
  // DR 1.1.3.01 Inventario / CR 2.1.6.01 Gastos de Importación por Aplicar
  //
  // La cuenta 2.1.6.01 es TRANSITORIA: queda en el pasivo hasta que el
  // usuario registre la factura del agente aduanal como compra normal
  // cargando contra esa misma cuenta. Así el pasivo se crea una sola vez.
  // ──────────────────────────────────────────────────────────────────

  async asientoGastoImportacion(params: {
    gastoId:      number;
    concepto:     string;
    montoDOP:     number;
    compraFolio:  string;
    usuarioId:    number;
  }): Promise<void> {
    if (params.montoDOP <= 0) return;
    try {
      await this._crearAsientoContabilizado({
        descripcion:     `Gasto importación: ${params.concepto} — ${params.compraFolio}`,
        tipoOrigen:      TipoOrigenAsiento.IMPORTACION,
        referenciaId:    params.gastoId,
        referenciaFolio: `GIMP-${params.gastoId}`,
        userId:          params.usuarioId,
        lineas: [
          {
            codigo:      COD.INVENTARIO,
            descripcion: `Costo importación — ${params.concepto}`,
            debe:        params.montoDOP,
            haber:       0,
          },
          {
            codigo:      COD.GASTOS_IMPORT_X_APLICAR,
            descripcion: `Gasto por aplicar — ${params.concepto}`,
            debe:        0,
            haber:       params.montoDOP,
          },
        ],
      });
      this.logger.log(`Asiento gasto importación #${params.gastoId} generado — ${params.montoDOP} DOP`);
    } catch (err) {
      this.logger.error(`Error asiento gasto importación #${params.gastoId}: ${(err as Error).message}`);
    }
  }
}
