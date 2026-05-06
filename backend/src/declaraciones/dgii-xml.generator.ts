/**
 * HiCloud ERP — Generador XML DGII República Dominicana
 * Formatos: 606 (Compras), 607 (Ventas/Anulados), IT-1 (ITBIS)
 * Especificación: Norma General DGII 01-2015 y Circular 003-2018
 */

function pad(n: string | number, len: number): string {
  return String(n).padStart(len, '0');
}

function fmtRnc(rnc: string): string {
  return (rnc ?? '').replace(/\D/g, '').padEnd(11, '0').substring(0, 11);
}

function fmtMonto(n: number): string {
  return Math.abs(n).toFixed(2).replace('.', '');
}

function fmtFecha(d: any): string {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function escXml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── FORMATO 606 — Reporte de Compras ─────────────────────────────────────────

export function generar606XML(data: {
  periodo: { mes: number; anio: number };
  rnc:     string;
  filas:   any[];
}): string {
  const { mes, anio } = data.periodo;
  const periodo = `${anio}${pad(mes, 2)}`;

  const detalles = data.filas.map((f, i) => `
    <DETALLE>
      <LINEA>${i + 1}</LINEA>
      <RNC_CEDULA_PROVEEDOR>${escXml(fmtRnc(f.rncProveedor))}</RNC_CEDULA_PROVEEDOR>
      <TIPO_ID_PROVEEDOR>${escXml(f.tipoId ?? '01')}</TIPO_ID_PROVEEDOR>
      <NCF>${escXml(f.ncf ?? '')}</NCF>
      <NCF_MODIFICADO>${escXml(f.ncfModificado ?? '')}</NCF_MODIFICADO>
      <FECHA_COMPROBANTE>${fmtFecha(f.fechaComprobante)}</FECHA_COMPROBANTE>
      <FECHA_PAGO>${fmtFecha(f.fechaPago ?? f.fechaComprobante)}</FECHA_PAGO>
      <TIPO_BIENES_SERVICIOS>${escXml(f.tipoBienes ?? '06')}</TIPO_BIENES_SERVICIOS>
      <MONTO_FACTURADO>${fmtMonto(f.montoFacturado ?? 0)}</MONTO_FACTURADO>
      <ITBIS_FACTURADO>${fmtMonto(f.itbis ?? 0)}</ITBIS_FACTURADO>
      <ITBIS_RETENIDO>${fmtMonto(f.itbisRetenido ?? 0)}</ITBIS_RETENIDO>
      <ITBIS_SUJETO_RETENCION>${fmtMonto(f.itbisSujetoRetencion ?? 0)}</ITBIS_SUJETO_RETENCION>
      <ITBIS_PERCIBIDO_COMPRA>${fmtMonto(f.itbisPercibido ?? 0)}</ITBIS_PERCIBIDO_COMPRA>
      <TIPO_RETENCION_ISR>${escXml(f.tipoRetencionISR ?? '')}</TIPO_RETENCION_ISR>
      <MONTO_RETENCION_RENTA>${fmtMonto(f.retencionISR ?? 0)}</MONTO_RETENCION_RENTA>
      <ISR_PERCIBIDO_COMPRA>${fmtMonto(f.isrPercibido ?? 0)}</ISR_PERCIBIDO_COMPRA>
      <IMPUESTO_ISC>${fmtMonto(f.isc ?? 0)}</IMPUESTO_ISC>
      <IMPUESTO_OTROS>${fmtMonto(f.otrosImpuestos ?? 0)}</IMPUESTO_OTROS>
      <MONTO_PROPORCIONALIDAD>${fmtMonto(f.montoProporcionalidad ?? 0)}</MONTO_PROPORCIONALIDAD>
      <ITBIS_COSTO>${fmtMonto(f.itbisCosto ?? 0)}</ITBIS_COSTO>
      <ITBIS_ADELANTAR>${fmtMonto(f.itbisAdelantar ?? 0)}</ITBIS_ADELANTAR>
      <ITBIS_PROPORCIONALDAD>${fmtMonto(f.itbisProporcionalidad ?? 0)}</ITBIS_PROPORCIONALDAD>
    </DETALLE>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<FORMATO_606 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ENCABEZADO>
    <RNC_EMPRESA>${escXml(fmtRnc(data.rnc))}</RNC_EMPRESA>
    <PERIODO_REPORTADO>${periodo}</PERIODO_REPORTADO>
    <CANTIDAD_REGISTROS>${data.filas.length}</CANTIDAD_REGISTROS>
    <TOTAL_MONTO_FACTURADO>${fmtMonto(data.filas.reduce((s: number, f: any) => s + (f.montoFacturado ?? 0), 0))}</TOTAL_MONTO_FACTURADO>
    <TOTAL_ITBIS_FACTURADO>${fmtMonto(data.filas.reduce((s: number, f: any) => s + (f.itbis ?? 0), 0))}</TOTAL_ITBIS_FACTURADO>
  </ENCABEZADO>
  <DETALLES>${detalles}
  </DETALLES>
</FORMATO_606>`;
}

// ── FORMATO 607 — Reporte de Ventas ──────────────────────────────────────────

export function generar607XML(data: {
  periodo: { mes: number; anio: number };
  rnc:     string;
  filas:   any[];
}): string {
  const { mes, anio } = data.periodo;
  const periodo = `${anio}${pad(mes, 2)}`;

  const detalles = data.filas.map((f, i) => `
    <DETALLE>
      <LINEA>${i + 1}</LINEA>
      <RNC_CEDULA_COMPRADOR>${escXml(fmtRnc(f.rncComprador))}</RNC_CEDULA_COMPRADOR>
      <TIPO_ID_COMPRADOR>${escXml(f.tipoId ?? '02')}</TIPO_ID_COMPRADOR>
      <NCF>${escXml(f.ncf ?? '')}</NCF>
      <NCF_MODIFICADO>${escXml(f.ncfModificado ?? '')}</NCF_MODIFICADO>
      <TIPO_INGRESO>${escXml(f.tipoIngreso ?? '01')}</TIPO_INGRESO>
      <FECHA_COMPROBANTE>${fmtFecha(f.fechaComprobante)}</FECHA_COMPROBANTE>
      <FECHA_RETENCION>${fmtFecha(f.fechaRetencion ?? '')}</FECHA_RETENCION>
      <MONTO_FACTURADO>${fmtMonto(f.montoFacturado ?? 0)}</MONTO_FACTURADO>
      <ITBIS_FACTURADO>${fmtMonto(f.itbis ?? 0)}</ITBIS_FACTURADO>
      <ITBIS_RETENIDO_TERCERO>${fmtMonto(f.itbisRetenido ?? 0)}</ITBIS_RETENIDO_TERCERO>
      <ITBIS_PERCIBIDO>${fmtMonto(f.itbisPercibido ?? 0)}</ITBIS_PERCIBIDO>
      <RETENCION_RENTA>${fmtMonto(f.isrRetenido ?? 0)}</RETENCION_RENTA>
      <ISR_PERCIBIDO>${fmtMonto(f.isrPercibido ?? 0)}</ISR_PERCIBIDO>
      <IMPUESTO_ISC>${fmtMonto(f.isc ?? 0)}</IMPUESTO_ISC>
      <IMPUESTO_OTROS>${fmtMonto(f.otrosImpuestos ?? 0)}</IMPUESTO_OTROS>
    </DETALLE>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<FORMATO_607 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ENCABEZADO>
    <RNC_EMPRESA>${escXml(fmtRnc(data.rnc))}</RNC_EMPRESA>
    <PERIODO_REPORTADO>${periodo}</PERIODO_REPORTADO>
    <CANTIDAD_REGISTROS>${data.filas.length}</CANTIDAD_REGISTROS>
    <TOTAL_MONTO_FACTURADO>${fmtMonto(data.filas.reduce((s: number, f: any) => s + (f.montoFacturado ?? 0), 0))}</TOTAL_MONTO_FACTURADO>
    <TOTAL_ITBIS_FACTURADO>${fmtMonto(data.filas.reduce((s: number, f: any) => s + (f.itbis ?? 0), 0))}</TOTAL_ITBIS_FACTURADO>
  </ENCABEZADO>
  <DETALLES>${detalles}
  </DETALLES>
</FORMATO_607>`;
}

// ── FORMATO 608 — Comprobantes Anulados ───────────────────────────────────────

export function generar608XML(data: {
  periodo: { mes: number; anio: number };
  rnc:     string;
  filas:   any[];
}): string {
  const { mes, anio } = data.periodo;
  const periodo = `${anio}${pad(mes, 2)}`;

  const detalles = data.filas.map((f, i) => `
    <DETALLE>
      <LINEA>${i + 1}</LINEA>
      <TIPO_ANULACION>${escXml(f.tipoAnulacion ?? '01')}</TIPO_ANULACION>
      <FECHA_COMPROBANTE>${fmtFecha(f.fechaComprobante)}</FECHA_COMPROBANTE>
      <FECHA_ANULACION>${fmtFecha(f.fechaAnulacion ?? new Date())}</FECHA_ANULACION>
      <NCF>${escXml(f.ncf ?? '')}</NCF>
    </DETALLE>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<FORMATO_608 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ENCABEZADO>
    <RNC_EMPRESA>${escXml(fmtRnc(data.rnc))}</RNC_EMPRESA>
    <PERIODO_REPORTADO>${periodo}</PERIODO_REPORTADO>
    <CANTIDAD_REGISTROS>${data.filas.length}</CANTIDAD_REGISTROS>
  </ENCABEZADO>
  <DETALLES>${detalles}
  </DETALLES>
</FORMATO_608>`;
}
