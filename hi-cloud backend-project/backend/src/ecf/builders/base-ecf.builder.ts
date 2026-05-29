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
} from './sections/comprador.section';
export { buildIdDoc, fmtFecha, addDias } from './sections/id-doc.section';
export {
  buildTotalesGravados,
  buildTotalesMixtos,
  buildTotalesExentos,
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
