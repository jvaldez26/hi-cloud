/**
 * Re-exporta todas las utilidades compartidas de los builders de e-CF.
 * Cada builder específico (e31, e32, …) importa desde aquí en lugar de
 * acceder directamente a las secciones internas.
 */

export type { EmpresaConfig } from './sections/emisor.section';
export { buildEmisor, assertEmisorOrder } from './sections/emisor.section';
export {
  COMPRADOR_GASTOS_MENORES,
  COMPRADOR_CONSUMIDOR_FINAL,
  buildCompradorRNC,
  buildCompradorExtranjero,
  razonSocialFiscal,
} from './sections/comprador.section';
export { buildIdDoc, fmtFecha, addDias } from './sections/id-doc.section';
export {
  round2,
  buildTotalesGravados,
  buildTotalesMixtos,
  buildTotalesExentos,
  buildTotalesTasaCero,
  buildTotalesE47,
  buildTotalesCero,
  tieneMontoGravado,
} from './sections/totales.section';
export { buildItems, buildItemsE33 } from './sections/items.section';
export { EcfRncRequeridoError } from '../errors/ecf.errors';

import { EmpresaEcfConfig } from '../entities/empresa-ecf-config.entity';
import { EmpresaConfig }    from './sections/emisor.section';
import { Factura }          from '../../facturas/entities/factura.entity';

// ── Tipos públicos compartidos ────────────────────────────────────────────────

export interface MSellerInfoReferencia {
  NCFModificado:      string;
  FechaNCFModificado: string;   // DD-MM-YYYY
  CodigoModificacion: string;   // '1'–'5'
}

export interface MSellerPayload {
  ECF: {
    Encabezado: {
      Version:    '1.0';
      IdDoc:      Record<string, unknown>;
      Emisor:     Record<string, unknown>;
      Comprador?: Record<string, unknown>;
      Totales:    Record<string, unknown>;
    };
    DetallesItems:          { Item: Record<string, unknown>[] };
    InformacionReferencia?: { NCFModificado: string; FechaNCFModificado: string; CodigoModificacion: string };
  };
}

export interface ECFBuildInput {
  encf:              string;
  factura:           Factura;
  config:            EmpresaEcfConfig;
  fechaVencSec:      Date;
  infoReferencia?:   MSellerInfoReferencia;   // E33 / E34
  nombreExtranjero?: string;                  // E46 / E47
  paisExtranjero?:   string;                  // E46 / E47 — ISO 2 letras
}

/** Mapea EmpresaEcfConfig → EmpresaConfig para buildEmisor. */
export function toEmpresaConfig(c: EmpresaEcfConfig): EmpresaConfig {
  return {
    rnc:             c.rncEmisor!,
    razonSocial:     c.razonSocialEmisor!,
    nombreComercial: c.nombreComercial,
    direccion:       c.direccionEmisor ?? c.razonSocialEmisor!,
    municipio:       c.municipio,
    provincia:       c.provincia,
  };
}

// ── Utilidad de moneda extranjera ─────────────────────────────────────────────

function fmt2(v: number): number { return parseFloat(v.toFixed(2)); }

export interface MonedaCtx {
  esME:    boolean;
  moneda:  string;
  tasa:    number;
  /** Convierte un monto de moneda extranjera a DOP */
  toDOP:   (v: number) => number;
  /** OtraMoneda para Encabezado (gravados: subtotal, itbis, total en moneda extranjera) */
  otraMonedaGravados: (subtotalME: number, itbisME: number, totalME: number) => Record<string, unknown> | undefined;
  /** OtraMoneda para Encabezado (exentos: total en moneda extranjera) */
  otraMonedaExentos:  (totalME: number) => Record<string, unknown> | undefined;
  /** OtraMonedaDetalle para cada Item */
  otraMonedaItem:     (precioME: number, montoME: number) => Record<string, unknown> | undefined;
}

/**
 * Resuelve el contexto de moneda de una factura.
 * Si la factura es en moneda extranjera, provee funciones para:
 *  - Convertir montos a DOP (principal en XML DGII)
 *  - Construir bloques OtraMoneda / OtraMonedaDetalle
 */
export function resolverMoneda(factura: any): MonedaCtx {
  const moneda = String(factura.moneda || 'DOP').toUpperCase();
  const tasa   = parseFloat(String(factura.tipoCambio || 1));
  const esME   = moneda !== 'DOP' && tasa > 1;

  const toDOP = (v: number) => esME ? fmt2(v * tasa) : fmt2(v);

  const otraMonedaGravados = (subtotalME: number, itbisME: number, totalME: number) =>
    esME ? {
      TipoMoneda:                    moneda,
      TipoCambio:                    tasa.toFixed(4),
      MontoGravadoTotalOtraMoneda:   fmt2(subtotalME).toFixed(2),
      TotalITBISOtraMoneda:          fmt2(itbisME).toFixed(2),
      MontoTotalOtraMoneda:          fmt2(totalME).toFixed(2),
    } : undefined;

  const otraMonedaExentos = (totalME: number) =>
    esME ? {
      TipoMoneda:              moneda,
      TipoCambio:              tasa.toFixed(4),
      MontoExentoOtraMoneda:   fmt2(totalME).toFixed(2),
      MontoTotalOtraMoneda:    fmt2(totalME).toFixed(2),
    } : undefined;

  const otraMonedaItem = (precioME: number, montoME: number) =>
    esME ? {
      PrecioOtraMoneda:    fmt2(precioME).toFixed(2),
      MontoItemOtraMoneda: fmt2(montoME).toFixed(2),
    } : undefined;

  return { esME, moneda, tasa, toDOP, otraMonedaGravados, otraMonedaExentos, otraMonedaItem };
}
