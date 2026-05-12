import { Injectable } from '@nestjs/common';
import { DeclaracionesService } from './declaraciones.service';
import { fechaDgii, montoEntero, tipoIdDgii } from './dgii.constants';

interface TxtResult { content: string; filename: string; }

@Injectable()
export class DgiiTxtGeneratorService {
  constructor(private readonly svc: DeclaracionesService) {}

  // ── 606 ─────────────────────────────────────────────────────────────────────

  async generar606Txt(mes: number, anio: number, userId?: number): Promise<TxtResult> {
    const data    = await this.svc.getFormato606(mes, anio);
    const rnc     = data.rnc ?? '';
    const periodo = `${anio}${String(mes).padStart(2,'0')}`;

    const lineas: string[] = [];
    // Cabecera
    lineas.push(`606|${rnc}|${periodo}|${data.filas.length}`);

    for (const f of data.filas) {
      const rncProv  = (f.rncProveedor ?? '').replace(/\D/g, '');
      const tipoId   = tipoIdDgii(rncProv) || '1';
      const tipoBien = f.tipoBienes ?? '09';
      const ncf      = f.ncfProveedor ?? '';
      const fechaCf  = fechaDgii(f.fechaComprobante);
      const fechaPag = fechaDgii(f.fechaPago) || fechaCf;
      const monto    = montoEntero(f.montoFacturado);
      const itbis    = montoEntero(f.itbis);
      const formPago = f.formaPago ?? '04';

      // Formato oficial 606 — 21 campos pipe-delimited
      lineas.push([
        rncProv,   // 1  RNC/Cédula proveedor
        tipoId,    // 2  Tipo ID: 1=RNC, 2=Cédula
        tipoBien,  // 3  Tipo bienes/servicios
        ncf,       // 4  NCF
        '',        // 5  NCF modificado (vacío si no aplica)
        fechaCf,   // 6  Fecha comprobante AAAAMMDD
        fechaPag,  // 7  Fecha pago
        monto,     // 8  Monto facturado (centavos)
        itbis,     // 9  ITBIS facturado
        0,         // 10 ITBIS retenido
        0,         // 11 ITBIS proporcionalidad
        0,         // 12 ITBIS costo
        itbis,     // 13 ITBIS a adelantar (crédito fiscal)
        0,         // 14 ITBIS percibido
        '',        // 15 Tipo retención ISR
        0,         // 16 Retención renta
        0,         // 17 ISR percibido
        0,         // 18 Impuesto selectivo consumo
        0,         // 19 Otros impuestos
        0,         // 20 Monto propina
        formPago,  // 21 Forma de pago
      ].join('|'));
    }

    const content  = lineas.join('\r\n'); // CRLF requerido por DGII
    const filename = `606_${rnc}_${periodo}.txt`;

    // Guardar en historial
    await this.svc.guardarReporte({
      tipo: '606', mes, anio, userId,
      totalLineas: data.filas.length,
      totalMonto:  data.totalMonto,
      errores: 0, advertencias: 0,
      contenido: content,
    });

    return { content, filename };
  }

  // ── 607 ─────────────────────────────────────────────────────────────────────

  async generar607Txt(mes: number, anio: number, userId?: number): Promise<TxtResult> {
    const data    = await this.svc.getFormato607(mes, anio);
    const rnc     = (data as any).rnc ?? '';
    const periodo = `${anio}${String(mes).padStart(2,'0')}`;

    const lineas: string[] = [];
    lineas.push(`607|${rnc}|${periodo}|${data.filas.length}`);

    for (const f of data.filas) {
      const rncComp  = (f.rncComprador ?? '').replace(/\D/g, '');
      const tipoId   = tipoIdDgii(rncComp) || '';
      const encf     = f.encf ?? '';            // eNCF REAL
      const tipoIng  = f.tipoIngreso ?? '01';
      const fechaCf  = fechaDgii(f.fechaComprobante);
      const monto    = montoEntero(f.montoFacturado);
      const itbis    = montoEntero(f.itbis);
      const efectivo = montoEntero(f.efectivo);
      const cheque   = montoEntero(f.chequeTransferencia);
      const tarjeta  = montoEntero(f.tarjeta);
      const credito  = montoEntero(f.credito);

      // Formato oficial 607 — 23 campos
      lineas.push([
        rncComp,   // 1  RNC/Cédula comprador
        tipoId,    // 2  Tipo ID
        encf,      // 3  NCF (eNCF real)
        '',        // 4  NCF modificado
        tipoIng,   // 5  Tipo ingreso
        fechaCf,   // 6  Fecha comprobante AAAAMMDD
        '',        // 7  Fecha retención
        monto,     // 8  Monto facturado
        itbis,     // 9  ITBIS facturado
        0,         // 10 ITBIS retenido por terceros
        0,         // 11 ITBIS percibido
        0,         // 12 Retención renta terceros
        0,         // 13 ISR percibido
        0,         // 14 Impuesto selectivo consumo
        0,         // 15 Otros impuestos
        0,         // 16 Monto propina
        efectivo,  // 17 Efectivo
        cheque,    // 18 Cheque / Transferencia
        tarjeta,   // 19 Tarjeta débito/crédito
        credito,   // 20 Crédito
        0,         // 21 Bonos / Certificados
        0,         // 22 Permuta
        0,         // 23 Otras formas
      ].join('|'));
    }

    const content  = lineas.join('\r\n');
    const filename = `607_${rnc}_${periodo}.txt`;

    await this.svc.guardarReporte({
      tipo: '607', mes, anio, userId,
      totalLineas: data.filas.length,
      totalMonto:  (data.totales as any)?.montoFacturado ?? 0,
      errores: 0, advertencias: 0,
      contenido: content,
    });

    return { content, filename };
  }

  // ── 608 ─────────────────────────────────────────────────────────────────────

  async generar608Txt(mes: number, anio: number, userId?: number): Promise<TxtResult> {
    const data        = await this.svc.getFormato608(mes, anio);
    const rnc         = await this.svc.getRnc();
    const periodo     = `${anio}${String(mes).padStart(2,'0')}`;
    const comprobantes = (data as any).comprobantes ?? (data as any).filas ?? [];

    const lineas: string[] = [];
    lineas.push(`608|${rnc}|${periodo}|${comprobantes.length}`);

    for (const f of comprobantes) {
      const ncf        = f.folio ?? f.ncf ?? '';
      const fechaCf    = fechaDgii(f.fecha ?? f.fechaComprobante);
      const fechaAnul  = fechaDgii(f.fechaCancelacion ?? f.fechaAnulacion) || fechaCf;

      // Formato oficial 608 — 3 campos
      lineas.push([ncf, fechaCf, fechaAnul].join('|'));
    }

    const content  = lineas.join('\r\n');
    const filename = `608_${rnc}_${periodo}.txt`;

    await this.svc.guardarReporte({
      tipo: '608', mes, anio, userId,
      totalLineas: comprobantes.length,
      totalMonto: 0,
      errores: 0, advertencias: 0,
      contenido: content,
    });

    return { content, filename };
  }
}
