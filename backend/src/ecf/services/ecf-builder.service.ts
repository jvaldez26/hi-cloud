import { Injectable } from '@nestjs/common';
import { Factura } from '../../facturas/entities/factura.entity';
import { EmpresaEcfConfig } from '../entities/empresa-ecf-config.entity';
import { EcfRncRequeridoError } from '../errors/ecf.errors';

// ── Interfaces del payload JSON MSeller ───────────────────────────────────────

export interface MSellerItem {
  NumeroLinea:            number;
  IndicadorFacturacion:   number;  // 1=18%, 2=16%, 4=exento
  NombreItem:             string;
  IndicadorBienoServicio: number;  // 1=Bien, 2=Servicio
  DescripcionItem?:       string;
  CantidadItem:           number | string;   // string en E33/E47
  UnidadMedida:           number | string;   // 43 en E31/E32, "47" en E33
  PrecioUnitarioItem:     number | string;
  MontoItem:              number | string;
  // E41: sección de retención dentro del ítem
  Retencion?: {
    IndicadorAgenteRetencionoPercepcion: number | string; // number en E41, string en E47
    MontoITBISRetenido?:  number;   // E41
    MontoISRRetenido?:    string;   // E47 string "0.00"
  };
  // E47: moneda extranjera por ítem
  OtraMonedaDetalle?: {
    PrecioOtraMoneda:   string;
    MontoItemOtraMoneda: string;
  };
  // E46: códigos internos
  TablaCodigosItem?: {
    CodigosItem: Array<{ TipoCodigo: string; CodigoItem: string }>;
  };
}

export interface MSellerIdDoc {
  TipoeCF:                   number;
  eNCF:                      string;
  FechaVencimientoSecuencia?: string;  // DD-MM-YYYY; ausente en E32<250K según spec
  IndicadorEnvioDiferido?:   number;   // 1 en E31,E32,E34,E44,E45,E46; ausente en E33,E41,E43,E47
  IndicadorMontoGravado?:    number;   // E32, E34, E41 solamente
  IndicadorNotaCredito?:     string;   // E34 exclusivo → "0"
  TipoIngresos?:             string;   // "01"; ausente en E41, E43, E47
  TipoPago?:                 number;   // ausente en E43, E47
  FechaLimitePago?:          string;   // DD-MM-YYYY; cuando TipoPago = 2
  NumeroCuentaPago?:         string;   // E47
  BancoPago?:                string;   // E47
  TablaFormasPago?: {                  // E33 obligatorio
    FormaDePago: Array<{ FormaPago: number; MontoPago: string }>;
  };
}

export interface MSellerEmisor {
  RNCEmisor:             string;
  RazonSocialEmisor:     string;
  NombreComercial?:      string;
  Sucursal?:             string;
  DireccionEmisor?:      string;
  Municipio?:            string;
  Provincia?:            string;
  FechaEmision:          string;   // DD-MM-YYYY
  // Campos adicionales E46
  CodigoVendedor?:       string;
  NumeroFacturaInterna?: string;
  NumeroPedidoInterno?:  number;
}

export interface MSellerComprador {
  RNCComprador?:            string;   // ausente en E47 (usa IdentificadorExtranjero)
  IdentificadorExtranjero?: string;   // E47 exclusivo
  RazonSocialComprador:     string;
  DireccionComprador?:      string;
  // Campos adicionales E46 (todos opcionales)
  ContactoComprador?:       string;
  CorreoComprador?:         string;
  MunicipioComprador?:      string;
  ProvinciaComprador?:      string;
  FechaEntrega?:            string;
  ContactoEntrega?:         string;
  DireccionEntrega?:        string;
  TelefonoAdicional?:       string;
  FechaOrdenCompra?:        string;
  NumeroOrdenCompra?:       string;
  CodigoInternoComprador?:  string;
}

export interface MSellerTotales {
  // Campos de ITBIS — solo enviar cuando MontoGravado > 0
  MontoGravadoTotal?:  number;
  MontoGravadoI1?:     number;
  MontoGravadoI2?:     number;
  MontoGravadoI3?:     number;   // E46: tasa 0%
  MontoExento?:        number;   // ausente cuando 0; E33/E46/E47 lo envían como string via cast
  ITBIS1?:             number;
  ITBIS2?:             number;
  ITBIS3?:             number;   // E46: tasa 0%
  TotalITBIS?:         number;
  TotalITBIS1?:        number;
  TotalITBIS2?:        number;
  TotalITBIS3?:        number;
  MontoTotal:          number;   // siempre presente
  // Retenciones — valores STRING según spec
  TotalITBISRetenido?: string;   // E41: "0.00"
  TotalISRRetencion?:  string;   // E41/E47: string con decimales
}

/** Información de referencia — nivel ECF (E33, E34). */
export interface MSellerInfoReferencia {
  NCFModificado:      string;
  FechaNCFModificado: string;    // DD-MM-YYYY
  CodigoModificacion: string;    // STRING: "3" en E33; "1"-"5" en E34
}

/** Sección informaciones adicionales para E46 — obligatoria. */
export interface MSellerInfoAdicionales {
  FechaEmbarque?:          string;
  NumeroEmbarque?:         string;
  NumeroContenedor?:       string;
  NumeroReferencia?:       string;
  NombrePuertoEmbarque?:   string;
  CondicionesEntrega?:     string;  // "FOB", "CIF", etc.
  TotalFob?:               string;  // string con decimales
  Seguro?:                 string;
  Flete?:                  string;
  TotalCif?:               string;
  RegimenAduanero?:        string;
  NombrePuertoSalida?:     string;
  NombrePuertoDesembarque?: string;
  PesoBruto?:              string;
  PesoNeto?:               string;
  UnidadPesoBruto?:        string;
  UnidadPesoNeto?:         string;
  CantidadBulto?:          string;
  UnidadBulto?:            string;
  VolumenBulto?:           string;
  UnidadVolumen?:          string;
}

/** Transporte para E46 — obligatorio. */
export interface MSellerTransporte {
  ViaTransporte:      string;  // "02" = marítimo, etc.
  PaisOrigen?:        string;
  DireccionDestino?:  string;
  PaisDestino?:       string;
  NumeroAlbaran?:     string;
}

/** Moneda extranjera — estructura correcta según spec oficial. */
export interface MSellerOtraMoneda {
  TipoMoneda:              string;   // "USD", "EUR" — campo correcto (no "Moneda")
  TipoCambio:              string;   // string "60.0000" según spec
  MontoExentoOtraMoneda?:  string;   // E47
  MontoTotalOtraMoneda:    string;   // E46/E47
}

/** Subtotales — obligatorio en E47. */
export interface MSellerSubtotales {
  Subtotal: Array<{
    NumeroSubTotal:      string;
    DescripcionSubtotal: string;
    Orden:               number;
    SubTotalExento:      string;
    MontoSubTotal:       string;
    Lineas:              number;
  }>;
}

export interface MSellerPayload {
  ECF: {
    Encabezado: {
      Version:    '1.0';
      IdDoc:      MSellerIdDoc;
      Emisor:     MSellerEmisor;
      Comprador?: MSellerComprador;   // opcional — E43 no tiene Comprador
      Totales:    MSellerTotales;
    };
    DetallesItems: { Item: MSellerItem[] };
    InformacionReferencia?:    MSellerInfoReferencia;    // nivel ECF (E33, E34)
    InformacionesAdicionales?: MSellerInfoAdicionales;   // E46
    Transporte?:               MSellerTransporte;        // E46
    OtraMoneda?:               MSellerOtraMoneda;        // E46, E47
    Subtotales?:               MSellerSubtotales;        // E47
    FechaHoraFirma?: string;
  };
}

/** Input normalizado que reciben todos los builders. */
export interface ECFBuildInput {
  encf:         string;
  factura:      Factura;
  config:       EmpresaEcfConfig;
  fechaVencSec: Date;
  infoReferencia?:  MSellerInfoReferencia;
  otraMoneda?:      MSellerOtraMoneda;
  transporte?:      MSellerTransporte;
  infoAdicionales?: MSellerInfoAdicionales;
  tipoRenta?:       string;
  tipoVenta?:       number;       // E32/E46: tipo de venta (1=contado, 2=crédito, etc.)
  tipoExportacion?: number;       // E46: tipo de exportación
  retencionISR?:    number;
}

// ── Interfaz Strategy ─────────────────────────────────────────────────────────

export interface IECFBuilder {
  readonly tipoEcf: number;
  build(input: ECFBuildInput): MSellerPayload;
}

// ── Helpers compartidos ───────────────────────────────────────────────────────

function fmtFecha(d: Date | string): string {
  const dt = d instanceof Date ? d : new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${dt.getFullYear()}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function cleanObj(e: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(e).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  );
}

/**
 * Construye el objeto Emisor con el orden exacto exigido por el schema XSD de MSeller/DGII.
 *
 * CRÍTICO: El schema XSD valida el orden de los elementos.
 * FechaEmision SIEMPRE debe ser el último campo del Emisor.
 * Usamos asignación explícita (no objeto literal) para garantizar el orden
 * incluso cuando los campos opcionales son null/undefined.
 *
 * Orden correcto:
 *   RNCEmisor → RazonSocialEmisor → [NombreComercial] → [Sucursal] →
 *   [DireccionEmisor] → [Municipio] → [Provincia] → FechaEmision
 */
function buildEmisor(config: EmpresaEcfConfig, fecha: Date | string): MSellerEmisor {
  const e: Record<string, unknown> = {};
  e['RNCEmisor']         = config.rncEmisor!;
  e['RazonSocialEmisor'] = config.razonSocialEmisor!;
  if (config.nombreComercial) e['NombreComercial'] = config.nombreComercial;
  if (config.direccionEmisor) e['DireccionEmisor'] = config.direccionEmisor;
  if (config.municipio)       e['Municipio']       = config.municipio;
  if (config.provincia)       e['Provincia']       = config.provincia;
  e['FechaEmision'] = fmtFecha(fecha ?? new Date()); // siempre al final
  return e as unknown as MSellerEmisor;
}

/**
 * Items estándar (números) — E31, E32, E34, E41, E43, E44, E45.
 * Acepta importeIva (FacturaDetalle) con fallback a iva (NotaDetalle).
 */
function buildItemsFromDetalles(detalles: any[]): MSellerItem[] {
  return (detalles ?? []).map((d: any, idx: number) => {
    const indicador = Number(d.porcentajeIva) === 18 ? 1
                    : Number(d.porcentajeIva) === 16 ? 2
                    : 4;
    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indicador,
      NombreItem:             d.descripcion,
      IndicadorBienoServicio: 1,
      CantidadItem:           Number(d.cantidad),
      UnidadMedida:           43,
      PrecioUnitarioItem:     round2(Number(d.precioUnitario)),
      MontoItem:              round2(Number(d.subtotal)),
    };
  });
}

/** Items con valores string y UnidadMedida "47" — E33 (spec oficial usa strings). */
function buildItemsE33(detalles: any[]): MSellerItem[] {
  return (detalles ?? []).map((d: any, idx: number) => {
    const indicador = Number(d.porcentajeIva) === 18 ? 1
                    : Number(d.porcentajeIva) === 16 ? 2
                    : 4;
    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indicador,
      NombreItem:             d.descripcion,
      IndicadorBienoServicio: 1,
      CantidadItem:           String(round2(Number(d.cantidad))),
      UnidadMedida:           '47',
      PrecioUnitarioItem:     round2(Number(d.precioUnitario)).toFixed(2),
      MontoItem:              round2(Number(d.subtotal)).toFixed(2),
    };
  });
}

/** Wrapper para Factura (backward compat E31/E32). */
function buildItems(factura: Factura): MSellerItem[] {
  return buildItemsFromDetalles(factura.detalles ?? []);
}

/**
 * Totales estándar (números) — solo incluye campos ITBIS cuando MontoGravado > 0.
 */
function buildTotalesFromDetalles(detalles: any[], total: number): MSellerTotales {
  let gravado18 = 0, gravado16 = 0, exento = 0, itbis18 = 0, itbis16 = 0;

  for (const d of (detalles ?? [])) {
    const pct        = Number(d.porcentajeIva);
    const importeIva = Number(d.importeIva ?? d.iva ?? 0);
    if (pct === 18)      { gravado18 += Number(d.subtotal); itbis18 += importeIva; }
    else if (pct === 16) { gravado16 += Number(d.subtotal); itbis16 += importeIva; }
    else                 { exento    += Number(d.subtotal); }
  }

  const hayGravado18 = gravado18 > 0;
  const hayGravado16 = gravado16 > 0;

  return {
    ...(hayGravado18 || hayGravado16 ? {
      MontoGravadoTotal: round2(gravado18 + gravado16),
      MontoGravadoI1:    round2(gravado18),
      ITBIS1:            18,
      TotalITBIS:        round2(itbis18 + itbis16),
      TotalITBIS1:       round2(itbis18),
    } : {}),
    ...(hayGravado16 ? {
      MontoGravadoI2: round2(gravado16),
      ITBIS2:         16,
      TotalITBIS2:    round2(itbis16),
    } : {}),
    ...(exento > 0 ? { MontoExento: round2(exento) } : {}),
    MontoTotal: round2(total),
  };
}

/** Totales E33 — spec usa strings para todos los montos. */
function buildTotalesE33(detalles: any[], total: number): Record<string, unknown> {
  let gravado18 = 0, gravado16 = 0, exento = 0, itbis18 = 0, itbis16 = 0;

  for (const d of (detalles ?? [])) {
    const pct = Number(d.porcentajeIva);
    const iva = Number(d.importeIva ?? d.iva ?? 0);
    if (pct === 18)      { gravado18 += Number(d.subtotal); itbis18 += iva; }
    else if (pct === 16) { gravado16 += Number(d.subtotal); itbis16 += iva; }
    else                 { exento    += Number(d.subtotal); }
  }

  const hayGravado = gravado18 + gravado16 > 0;

  return {
    ...(hayGravado ? {
      MontoGravadoTotal: round2(gravado18 + gravado16).toFixed(2),
      MontoGravadoI1:    round2(gravado18).toFixed(2),
      ITBIS1:            18,
      TotalITBIS:        round2(itbis18 + itbis16).toFixed(2),
      TotalITBIS1:       round2(itbis18).toFixed(2),
    } : {}),
    ...(gravado16 > 0 ? {
      MontoGravadoI2: round2(gravado16).toFixed(2),
      ITBIS2:         16,
      TotalITBIS2:    round2(itbis16).toFixed(2),
    } : {}),
    ...(exento > 0 ? { MontoExento: round2(exento).toFixed(2) } : {}),
    MontoTotal: round2(total).toFixed(2),
  };
}

/** Wrapper para Factura (backward compat). */
function buildTotales(factura: Factura): MSellerTotales {
  return buildTotalesFromDetalles(factura.detalles ?? [], Number(factura.total));
}

// ── E31: Factura de Crédito Fiscal ────────────────────────────────────────────

class ECFBuilder31 implements IECFBuilder {
  readonly tipoEcf = 31;

  build({ encf, factura, config, fechaVencSec }: ECFBuildInput): MSellerPayload {
    const cliente      = factura.cliente;
    const rncComprador = cliente?.rncReceptor ?? cliente?.rfc;
    if (!rncComprador) throw new EcfRncRequeridoError(31, Number(factura.total));

    const emisor = buildEmisor(config, factura.fecha ?? new Date());

    const comprador: MSellerComprador = {
      RNCComprador:         rncComprador,
      RazonSocialComprador: cliente?.nombre ?? 'Sin nombre',
      ...(cliente?.direccion ? { DireccionComprador: cliente.direccion } : {}),
    };

    return {
      ECF: {
        Encabezado: {
          Version: '1.0',
          IdDoc: {
            TipoeCF:                   31,
            eNCF:                      encf,
            FechaVencimientoSecuencia: fmtFecha(fechaVencSec),
            IndicadorEnvioDiferido:    1,
            TipoIngresos:              '01',
            TipoPago:                  1,
          },
          Emisor:    emisor,
          Comprador: comprador,
          Totales:   buildTotales(factura),
        },
        DetallesItems: { Item: buildItems(factura) },
      },
    };
  }
}

// ── E32: Factura de Consumo ───────────────────────────────────────────────────

const MONTO_RNC_OBLIGATORIO_E32 = 250_000;

class ECFBuilder32 implements IECFBuilder {
  readonly tipoEcf = 32;

  build({ encf, factura, config, fechaVencSec }: ECFBuildInput): MSellerPayload {
    const cliente      = factura.cliente;
    const total        = Number(factura.total);
    const rncComprador = cliente?.rncReceptor ?? cliente?.rfc;

    if (total >= MONTO_RNC_OBLIGATORIO_E32 && !rncComprador) {
      throw new EcfRncRequeridoError(32, total);
    }

    const emisor = buildEmisor(config, factura.fecha ?? new Date());

    const comprador: MSellerComprador = {
      RNCComprador:         rncComprador ?? '00000000000',
      RazonSocialComprador: rncComprador ? (cliente?.nombre ?? 'Cliente') : 'Consumidor Final',
      ...(cliente?.direccion ? { DireccionComprador: cliente.direccion } : {}),
    };

    const totales = buildTotales(factura);

    return {
      ECF: {
        Encabezado: {
          Version: '1.0',
          IdDoc: {
            TipoeCF:                   32,
            eNCF:                      encf,
            FechaVencimientoSecuencia: fmtFecha(fechaVencSec),
            IndicadorEnvioDiferido:    1,
            IndicadorMontoGravado:     (totales.MontoGravadoTotal ?? 0) > 0 ? 1 : 0,
            TipoIngresos:              '01',
            TipoPago:                  1,
          },
          Emisor:    emisor,
          Comprador: comprador,
          Totales:   totales,
        },
        DetallesItems: { Item: buildItems(factura) },
      },
    };
  }
}

// ── E33: Nota de Débito ───────────────────────────────────────────────────────

class ECFBuilder33 implements IECFBuilder {
  readonly tipoEcf = 33;

  build({ encf, factura, config, fechaVencSec, infoReferencia }: ECFBuildInput): MSellerPayload {
    if (!infoReferencia) {
      throw new Error('E33 requiere infoReferencia con NCFModificado y FechaNCFModificado');
    }

    const cliente      = factura.cliente;
    const rncComprador = cliente?.rncReceptor ?? cliente?.rfc ?? '00000000000';
    const emisor       = buildEmisor(config, factura.fecha ?? new Date());
    const comprador: MSellerComprador = {
      RNCComprador:         rncComprador,
      RazonSocialComprador: cliente?.nombre ?? 'Sin nombre',
      ...(cliente?.direccion ? { DireccionComprador: cliente.direccion } : {}),
    };

    const montoTotal  = round2(Number(factura.total));
    const totalesE33  = buildTotalesE33(factura.detalles ?? [], montoTotal);
    const detalles    = buildItemsE33(factura.detalles ?? []);

    return {
      ECF: {
        Encabezado: {
          Version: '1.0',
          IdDoc: {
            TipoeCF:                   33,
            eNCF:                      encf,
            FechaVencimientoSecuencia: fmtFecha(fechaVencSec),
            TipoIngresos:              '01',
            TipoPago:                  1,
            TablaFormasPago: {
              FormaDePago: [{ FormaPago: 1, MontoPago: montoTotal.toFixed(2) }],
            },
          },
          Emisor:    emisor,
          Comprador: comprador,
          Totales:   totalesE33 as unknown as MSellerTotales,
        },
        DetallesItems: { Item: detalles },
        InformacionReferencia: {
          NCFModificado:      infoReferencia.NCFModificado,
          FechaNCFModificado: infoReferencia.FechaNCFModificado,
          CodigoModificacion: String(infoReferencia.CodigoModificacion ?? '3'),
        },
      },
    };
  }
}

// ── E34: Nota de Crédito ──────────────────────────────────────────────────────

class ECFBuilder34 implements IECFBuilder {
  readonly tipoEcf = 34;

  build({ encf, factura, config, fechaVencSec, infoReferencia }: ECFBuildInput): MSellerPayload {
    if (!infoReferencia) {
      throw new Error('E34 requiere infoReferencia con NCFModificado y CodigoModificacion ("1"-"5")');
    }

    const cliente      = factura.cliente;
    const rncComprador = cliente?.rncReceptor ?? cliente?.rfc ?? '00000000000';
    const emisor       = buildEmisor(config, factura.fecha ?? new Date());
    const comprador: MSellerComprador = {
      RNCComprador:         rncComprador,
      RazonSocialComprador: cliente?.nombre ?? 'Sin nombre',
      ...(cliente?.direccion ? { DireccionComprador: cliente.direccion } : {}),
    };
    const totales  = buildTotalesFromDetalles(factura.detalles ?? [], Number(factura.total));
    const detalles = buildItemsFromDetalles(factura.detalles ?? []);

    return {
      ECF: {
        Encabezado: {
          Version: '1.0',
          IdDoc: {
            TipoeCF:                   34,
            eNCF:                      encf,
            FechaVencimientoSecuencia: fmtFecha(fechaVencSec),
            IndicadorNotaCredito:      '0',
            IndicadorEnvioDiferido:    1,
            IndicadorMontoGravado:     (totales.MontoGravadoTotal ?? 0) > 0 ? 1 : 0,
            TipoIngresos:              '01',
            TipoPago:                  2,
          },
          Emisor:    emisor,
          Comprador: comprador,
          Totales:   totales,
        },
        DetallesItems: { Item: detalles },
        InformacionReferencia: {
          NCFModificado:      infoReferencia.NCFModificado,
          FechaNCFModificado: infoReferencia.FechaNCFModificado,
          CodigoModificacion: String(infoReferencia.CodigoModificacion),
        },
      },
    };
  }
}

// ── E41: Comprobante de Compras ───────────────────────────────────────────────

class ECFBuilder41 implements IECFBuilder {
  readonly tipoEcf = 41;

  build({ encf, factura, config, fechaVencSec }: ECFBuildInput): MSellerPayload {
    const proveedor    = factura.cliente;
    const rncProveedor = proveedor?.rncReceptor ?? proveedor?.rfc;
    if (!rncProveedor) throw new EcfRncRequeridoError(41, Number(factura.total));

    const emisor   = buildEmisor(config, factura.fecha ?? new Date());
    const comprador: MSellerComprador = {
      RNCComprador:         rncProveedor,
      RazonSocialComprador: proveedor?.nombre ?? 'Proveedor',
      ...(proveedor?.direccion ? { DireccionComprador: proveedor.direccion } : {}),
    };
    const totalesBase = buildTotalesFromDetalles(factura.detalles ?? [], Number(factura.total));
    const totales: MSellerTotales = {
      ...totalesBase,
      TotalITBISRetenido: '0.00',
      TotalISRRetencion:  '0.00',
    };

    const detalles: MSellerItem[] = buildItemsFromDetalles(factura.detalles ?? []).map(item => ({
      ...item,
      Retencion: {
        IndicadorAgenteRetencionoPercepcion: 1,   // número en E41
        MontoITBISRetenido: 0.0,
      },
    }));

    return {
      ECF: {
        Encabezado: {
          Version: '1.0',
          IdDoc: {
            TipoeCF:                   41,
            eNCF:                      encf,
            FechaVencimientoSecuencia: fmtFecha(fechaVencSec),
            IndicadorMontoGravado:     (totalesBase.MontoGravadoTotal ?? 0) > 0 ? 1 : 0,
            TipoPago:                  2,
          },
          Emisor:    emisor,
          Comprador: comprador,
          Totales:   totales,
        },
        DetallesItems: { Item: detalles },
      },
    };
  }
}

// ── E43: Gastos Menores ───────────────────────────────────────────────────────

class ECFBuilder43 implements IECFBuilder {
  readonly tipoEcf = 43;

  build({ encf, factura, config, fechaVencSec }: ECFBuildInput): MSellerPayload {
    const emisor     = buildEmisor(config, factura.fecha ?? new Date());
    const montoTotal = round2(Number(factura.total));
    const detalles   = buildItemsFromDetalles(factura.detalles ?? []);

    return {
      ECF: {
        Encabezado: {
          Version: '1.0',
          IdDoc: {
            TipoeCF:                   43,
            eNCF:                      encf,
            FechaVencimientoSecuencia: fmtFecha(fechaVencSec),
            // E43 no tiene TipoIngresos, TipoPago, IndicadorEnvioDiferido, IndicadorMontoGravado
          },
          Emisor: emisor,
          // E43 no tiene Comprador
          Totales: { MontoExento: montoTotal, MontoTotal: montoTotal },
        },
        DetallesItems: { Item: detalles },
      },
    };
  }
}

// ── E44: Regímenes Especiales (Zona Franca) ───────────────────────────────────

class ECFBuilder44 implements IECFBuilder {
  readonly tipoEcf = 44;

  build({ encf, factura, config, fechaVencSec }: ECFBuildInput): MSellerPayload {
    const cliente      = factura.cliente;
    const rncComprador = cliente?.rncReceptor ?? cliente?.rfc;
    if (!rncComprador) throw new EcfRncRequeridoError(44, Number(factura.total));

    const emisor   = buildEmisor(config, factura.fecha ?? new Date());
    const comprador: MSellerComprador = {
      RNCComprador:         rncComprador,
      RazonSocialComprador: cliente?.nombre ?? 'Sin nombre',
      ...(cliente?.direccion ? { DireccionComprador: cliente.direccion } : {}),
    };

    // E44: zona franca — ITBIS siempre 0. Usar subtotal para excluir cualquier ITBIS calculado.
    const montoExento = round2(Number((factura as any).subtotal ?? factura.total));

    // Todos los ítems son exentos (IndicadorFacturacion: 4) independientemente del producto
    const items: MSellerItem[] = (factura.detalles ?? []).map((d: any, idx: number) => ({
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   4,
      NombreItem:             d.descripcion,
      IndicadorBienoServicio: 1,
      CantidadItem:           Number(d.cantidad),
      UnidadMedida:           43,
      PrecioUnitarioItem:     round2(Number(d.precioUnitario)),
      MontoItem:              round2(Number(d.subtotal)),
    }));

    return {
      ECF: {
        Encabezado: {
          Version: '1.0',
          IdDoc: {
            TipoeCF:                   44,
            eNCF:                      encf,
            FechaVencimientoSecuencia: fmtFecha(fechaVencSec),
            IndicadorEnvioDiferido:    1,
            TipoIngresos:              '01',
            TipoPago:                  1,
          },
          Emisor:    emisor,
          Comprador: comprador,
          Totales:   { MontoExento: montoExento, MontoTotal: montoExento },
        },
        DetallesItems: { Item: items },
      },
    };
  }
}

// ── E45: Gubernamental ────────────────────────────────────────────────────────

class ECFBuilder45 implements IECFBuilder {
  readonly tipoEcf = 45;

  build({ encf, factura, config, fechaVencSec }: ECFBuildInput): MSellerPayload {
    const cliente      = factura.cliente;
    const rncComprador = cliente?.rncReceptor ?? cliente?.rfc;
    if (!rncComprador) throw new EcfRncRequeridoError(45, Number(factura.total));

    const emisor   = buildEmisor(config, factura.fecha ?? new Date());
    const comprador: MSellerComprador = {
      RNCComprador:         rncComprador,
      RazonSocialComprador: cliente?.nombre ?? 'Entidad Gubernamental',
      ...(cliente?.direccion ? { DireccionComprador: cliente.direccion } : {}),
      ...((cliente as any)?.numeroOrdenCompra ? { NumeroOrdenCompra: (cliente as any).numeroOrdenCompra } : {}),
    };
    const totales  = buildTotalesFromDetalles(factura.detalles ?? [], Number(factura.total));
    const detalles = buildItemsFromDetalles(factura.detalles ?? []);

    return {
      ECF: {
        Encabezado: {
          Version: '1.0',
          IdDoc: {
            TipoeCF:                   45,
            eNCF:                      encf,
            FechaVencimientoSecuencia: fmtFecha(fechaVencSec),
            IndicadorEnvioDiferido:    1,
            TipoIngresos:              '01',
            TipoPago:                  1,
          },
          Emisor:    emisor,
          Comprador: comprador,
          Totales:   totales,
        },
        DetallesItems: { Item: detalles },
      },
    };
  }
}

// ── E46: Exportaciones ────────────────────────────────────────────────────────

class ECFBuilder46 implements IECFBuilder {
  readonly tipoEcf = 46;

  build({ encf, factura, config, fechaVencSec, otraMoneda, transporte, infoAdicionales }: ECFBuildInput): MSellerPayload {
    const cliente  = factura.cliente;
    const emisor   = buildEmisor(config, factura.fecha ?? new Date());
    const comprador: MSellerComprador = {
      RNCComprador:         cliente?.rncReceptor ?? cliente?.rfc ?? '00000000000',
      RazonSocialComprador: cliente?.nombre ?? 'Cliente Extranjero',
      ...(cliente?.direccion ? { DireccionComprador: cliente.direccion } : {}),
    };
    const montoTotal = round2(Number(factura.total));

    // E46 usa nomenclatura I3 (tasa 0%) y strings en Totales
    const totalesE46: Record<string, unknown> = {
      MontoGravadoTotal: montoTotal.toFixed(2),
      MontoGravadoI3:    montoTotal.toFixed(2),
      ITBIS3:            0,
      TotalITBIS:        '0.00',
      TotalITBIS3:       '0.00',
      MontoTotal:        montoTotal.toFixed(2),
    };

    const detalles = buildItemsFromDetalles(factura.detalles ?? []);

    const payload: MSellerPayload = {
      ECF: {
        Encabezado: {
          Version: '1.0',
          IdDoc: {
            TipoeCF:                   46,
            eNCF:                      encf,
            FechaVencimientoSecuencia: fmtFecha(fechaVencSec),
            IndicadorEnvioDiferido:    1,
            TipoIngresos:              '01',
            TipoPago:                  1,
          },
          Emisor:    emisor,
          Comprador: comprador,
          Totales:   totalesE46 as unknown as MSellerTotales,
        },
        DetallesItems: { Item: detalles },
      },
    };

    if (infoAdicionales) payload.ECF.InformacionesAdicionales = infoAdicionales;
    if (transporte)       payload.ECF.Transporte               = transporte;
    if (otraMoneda)       payload.ECF.OtraMoneda               = otraMoneda;

    return payload;
  }
}

// ── E47: Pagos al Exterior ────────────────────────────────────────────────────

class ECFBuilder47 implements IECFBuilder {
  readonly tipoEcf = 47;

  build({ encf, factura, config, fechaVencSec, otraMoneda, retencionISR }: ECFBuildInput): MSellerPayload {
    const beneficiario = factura.cliente;
    const emisor       = buildEmisor(config, factura.fecha ?? new Date());

    // E47 usa IdentificadorExtranjero, no RNCComprador
    const comprador: MSellerComprador = {
      IdentificadorExtranjero: beneficiario?.rncReceptor ?? beneficiario?.rfc ?? '00000000',
      RazonSocialComprador:    beneficiario?.nombre ?? 'Beneficiario Exterior',
      ...(beneficiario?.direccion ? { DireccionComprador: beneficiario.direccion } : {}),
    };

    const montoTotal      = round2(Number(factura.total));
    const pctRetencion    = retencionISR ?? 27;
    const montoRetencion  = round2(montoTotal * pctRetencion / 100);

    // E47 Totales — todos strings según spec
    const totalesE47: Record<string, unknown> = {
      MontoExento:       montoTotal.toFixed(2),
      MontoTotal:        montoTotal.toFixed(2),
      TotalISRRetencion: montoRetencion.toFixed(2),
    };

    const detalles: MSellerItem[] = buildItemsFromDetalles(factura.detalles ?? []).map(item => ({
      ...item,
      Retencion: {
        IndicadorAgenteRetencionoPercepcion: '1',                    // STRING en E47
        MontoISRRetenido: montoRetencion.toFixed(2),
      },
      ...(otraMoneda ? {
        OtraMonedaDetalle: {
          PrecioOtraMoneda:    round2(Number(item.PrecioUnitarioItem) / Number(otraMoneda.TipoCambio)).toFixed(4),
          MontoItemOtraMoneda: round2(Number(item.MontoItem) / Number(otraMoneda.TipoCambio)).toFixed(2),
        },
      } : {}),
    }));

    // Subtotales E47 — obligatorio
    const subtotales: MSellerSubtotales = {
      Subtotal: [{
        NumeroSubTotal:      '1',
        DescripcionSubtotal: 'N/A',
        Orden:               1,
        SubTotalExento:      montoTotal.toFixed(2),
        MontoSubTotal:       montoTotal.toFixed(2),
        Lineas:              detalles.length,
      }],
    };

    const payload: MSellerPayload = {
      ECF: {
        Encabezado: {
          Version: '1.0',
          IdDoc: {
            TipoeCF:                   47,
            eNCF:                      encf,
            FechaVencimientoSecuencia: fmtFecha(fechaVencSec),
            // E47 no tiene TipoIngresos, IndicadorEnvioDiferido, TipoPago
          },
          Emisor:    emisor,
          Comprador: comprador,
          Totales:   totalesE47 as unknown as MSellerTotales,
        },
        DetallesItems: { Item: detalles },
        Subtotales:    subtotales,
      },
    };

    if (otraMoneda) payload.ECF.OtraMoneda = otraMoneda;

    return payload;
  }
}

// ── Servicio orquestador ──────────────────────────────────────────────────────

@Injectable()
export class ECFBuilderService {
  private readonly builders = new Map<number, IECFBuilder>();

  constructor() {
    this.register(new ECFBuilder31());
    this.register(new ECFBuilder32());
    this.register(new ECFBuilder33());
    this.register(new ECFBuilder34());
    this.register(new ECFBuilder41());
    this.register(new ECFBuilder43());
    this.register(new ECFBuilder44());
    this.register(new ECFBuilder45());
    this.register(new ECFBuilder46());
    this.register(new ECFBuilder47());
  }

  private register(builder: IECFBuilder): void {
    this.builders.set(builder.tipoEcf, builder);
  }

  build(tipoEcf: number, input: ECFBuildInput): MSellerPayload {
    const builder = this.builders.get(tipoEcf);
    if (!builder) {
      throw new Error(
        `No hay builder registrado para E${tipoEcf}. ` +
        `Soportados: ${[...this.builders.keys()].map(k => `E${k}`).join(', ')}`,
      );
    }
    return builder.build(input);
  }

  getTiposSoportados(): number[] {
    return [...this.builders.keys()].sort((a, b) => a - b);
  }
}
