import { EmpresaEcfConfig } from '../entities/empresa-ecf-config.entity';
import { Factura } from '../../facturas/entities/factura.entity';

import { EmpresaConfig, buildEmisor, assertEmisorOrder } from './sections/emisor.section';
import {
  COMPRADOR_GASTOS_MENORES,
  COMPRADOR_CONSUMIDOR_FINAL,
  buildCompradorRNC,
  buildCompradorExtranjero,
} from './sections/comprador.section';
import { buildIdDoc, fmtFecha, addDias } from './sections/id-doc.section';
import {
  buildTotalesGravados,
  buildTotalesMixtos,
  buildTotalesExentos,
  tieneMontoGravado,
} from './sections/totales.section';
import {
  buildItems,
  buildItemsConImpuesto,
  buildItemsE33,
} from './sections/items.section';

import { EcfRncRequeridoError } from '../errors/ecf.errors';

// ── Tipos públicos exportados ─────────────────────────────────────────────────

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

// ── Mapper EmpresaEcfConfig → EmpresaConfig ───────────────────────────────────

function toEmpresaConfig(c: EmpresaEcfConfig): EmpresaConfig {
  return {
    rnc:         c.rncEmisor!,
    razonSocial: c.razonSocialEmisor!,
    nombreComercial: c.nombreComercial,
    direccion:   c.direccionEmisor ?? c.razonSocialEmisor!,
    municipio:   c.municipio,
    provincia:   c.provincia,
  };
}

// ── Builder por tipo ──────────────────────────────────────────────────────────

function buildE31(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc;
  if (!rnc) throw new EcfRncRequeridoError(31, Number(factura.total));

  const fecha    = fmtFecha(factura.fecha ?? new Date());
  const emisor   = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detalles = factura.detalles as any[] ?? [];
  const totales  = buildTotalesGravados(detalles, Number(factura.total));

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                    31,
          encf,
          fechaVencSec,
          indicadorEnvioDiferido:  1,
          tipoIngresos:            '01',
          tipoPago:                1,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, cliente?.nombre ?? 'Sin nombre',
          cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
        ),
        Totales: totales,
      },
      DetallesItems: { Item: buildItems(detalles) },
    },
  };
}

const MONTO_RNC_OBLIGATORIO_E32 = 250_000;

function buildE32(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const cliente   = factura.cliente as any;
  const rnc       = cliente?.rncReceptor ?? cliente?.rfc;
  const total     = Number(factura.total);

  if (total >= MONTO_RNC_OBLIGATORIO_E32 && !rnc) {
    throw new EcfRncRequeridoError(32, total);
  }

  const fecha    = fmtFecha(factura.fecha ?? new Date());
  const emisor   = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detalles = factura.detalles as any[] ?? [];
  const totales  = buildTotalesMixtos(detalles, total);
  const hayGravado: 0 | 1 = tieneMontoGravado(detalles) ? 1 : 0;

  const comprador = rnc
    ? buildCompradorRNC(rnc, cliente?.nombre ?? 'Cliente',
        cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
      )
    : { ...COMPRADOR_CONSUMIDOR_FINAL };

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                    32,
          encf,
          // SIN FechaVencimientoSecuencia (spec definitiva)
          indicadorEnvioDiferido:  1,
          indicadorMontoGravado:   hayGravado,
          tipoIngresos:            '01',
          tipoPago:                1,
        }),
        Emisor:    emisor,
        Comprador: comprador,
        Totales:   totales,
      },
      DetallesItems: { Item: buildItems(detalles) },
    },
  };
}

function buildE33(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, infoReferencia } = input;
  if (!infoReferencia) {
    throw new Error('E33 requiere infoReferencia con NCFModificado y FechaNCFModificado');
  }

  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc ?? '00000000000';
  const total   = Number(factura.total);
  const fecha   = fmtFecha(factura.fecha ?? new Date());
  const emisor  = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detalles = factura.detalles as any[] ?? [];

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:              33,
          encf,
          fechaVencSec,
          // SIN IndicadorEnvioDiferido
          tipoIngresos:      '01',
          tipoPago:          1,
          tablaFormasPago:   { FormaDePago: [{ FormaPago: 1, MontoPago: total.toFixed(2) }] },
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, cliente?.nombre ?? 'Sin nombre',
          cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
        ),
        Totales: buildTotalesExentos(total),
      },
      DetallesItems: { Item: buildItemsE33(detalles) },
      InformacionReferencia: {
        NCFModificado:      infoReferencia.NCFModificado,
        FechaNCFModificado: infoReferencia.FechaNCFModificado,
        CodigoModificacion: String(infoReferencia.CodigoModificacion ?? '3'),
      },
    },
  };
}

function buildE34(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, infoReferencia } = input;
  if (!infoReferencia) {
    throw new Error('E34 requiere infoReferencia con NCFModificado y CodigoModificacion ("1"–"5")');
  }

  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc ?? '00000000000';
  const total   = Number(factura.total);
  const fecha   = fmtFecha(factura.fecha ?? new Date());
  const emisor  = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detalles    = factura.detalles as any[] ?? [];
  const hayGravado: 0 | 1 = tieneMontoGravado(detalles) ? 1 : 0;
  const fechaLimite = addDias(factura.fecha ?? new Date(), 30);

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                   34,
          encf,
          fechaVencSec,
          indicadorNotaCredito:   '0',
          indicadorEnvioDiferido: 1,
          indicadorMontoGravado:  hayGravado,
          tipoIngresos:           '01',
          tipoPago:               2,
          fechaLimitePago:        fechaLimite,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, cliente?.nombre ?? 'Sin nombre',
          cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
        ),
        Totales: buildTotalesExentos(total),
      },
      DetallesItems: { Item: buildItems(detalles) },
      InformacionReferencia: {
        NCFModificado:      infoReferencia.NCFModificado,
        FechaNCFModificado: infoReferencia.FechaNCFModificado,
        CodigoModificacion: String(infoReferencia.CodigoModificacion),
      },
    },
  };
}

function buildE41(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const proveedor = factura.cliente as any;
  const rnc       = proveedor?.rncReceptor ?? proveedor?.rfc;
  if (!rnc) throw new EcfRncRequeridoError(41, Number(factura.total));

  const fecha    = fmtFecha(factura.fecha ?? new Date());
  const emisor   = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detalles    = factura.detalles as any[] ?? [];
  const total       = Number(factura.total);
  const hayGravado: 0 | 1 = tieneMontoGravado(detalles) ? 1 : 0;
  const fechaLimite = addDias(factura.fecha ?? new Date(), 30);

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                  41,
          encf,
          fechaVencSec,
          indicadorMontoGravado: hayGravado,
          // SIN TipoIngresos en E41
          tipoPago:              2,
          fechaLimitePago:       fechaLimite,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, proveedor?.nombre ?? 'Proveedor',
          proveedor?.direccion ? { DireccionComprador: proveedor.direccion } : undefined,
        ),
        Totales: buildTotalesGravados(detalles, total),
      },
      DetallesItems: { Item: buildItems(detalles) },
    },
  };
}

function buildE43(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const total  = Number(factura.total);
  const fecha  = fmtFecha(factura.fecha ?? new Date());
  const emisor = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                  43,
          encf,
          fechaVencSec,
          indicadorMontoGravado: 0,   // siempre exento
          tipoPago:              1,
        }),
        Emisor:    emisor,
        Comprador: { ...COMPRADOR_GASTOS_MENORES },   // obligatorio en E43
        Totales:   buildTotalesExentos(total),
      },
      DetallesItems: { Item: buildItems(factura.detalles as any[] ?? []) },
    },
  };
}

function buildE44(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc;
  if (!rnc) throw new EcfRncRequeridoError(44, Number(factura.total));

  const montoExento = Number((factura as any).subtotal ?? factura.total);
  const fecha       = fmtFecha(factura.fecha ?? new Date());
  const emisor      = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const items = (factura.detalles as any[] ?? []).map((d: any, idx: number) => ({
    NumeroLinea:            idx + 1,
    IndicadorFacturacion:   4,          // siempre exento en zona franca
    NombreItem:             d.descripcion,
    IndicadorBienoServicio: 1,
    CantidadItem:           Number(d.cantidad),
    UnidadMedida:           43,
    PrecioUnitarioItem:     Math.round(Number(d.precioUnitario) * 100) / 100,
    MontoItem:              Math.round(Number(d.subtotal) * 100) / 100,
  }));

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                  44,
          encf,
          fechaVencSec,
          indicadorMontoGravado: 0,
          tipoIngresos:          '01',
          tipoPago:              1,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, cliente?.nombre ?? 'Sin nombre',
          cliente?.direccion ? { DireccionComprador: cliente.direccion } : undefined,
        ),
        Totales: buildTotalesExentos(montoExento),
      },
      DetallesItems: { Item: items },
    },
  };
}

function buildE45(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec } = input;
  const cliente = factura.cliente as any;
  const rnc     = cliente?.rncReceptor ?? cliente?.rfc;
  if (!rnc) throw new EcfRncRequeridoError(45, Number(factura.total));

  const fecha    = fmtFecha(factura.fecha ?? new Date());
  const emisor   = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  const detalles    = factura.detalles as any[] ?? [];
  const hayGravado: 0 | 1 = tieneMontoGravado(detalles) ? 1 : 0;

  const compradorExtras: Record<string, unknown> = {};
  if (cliente?.direccion)       compradorExtras['DireccionComprador'] = cliente.direccion;
  if (cliente?.numeroOrdenCompra) compradorExtras['NumeroOrdenCompra'] = cliente.numeroOrdenCompra;

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                  45,
          encf,
          fechaVencSec,
          indicadorMontoGravado: hayGravado,
          tipoIngresos:          '01',
          tipoPago:              1,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorRNC(rnc, cliente?.nombre ?? 'Entidad Gubernamental', compradorExtras),
        Totales:   buildTotalesGravados(detalles, Number(factura.total)),
      },
      DetallesItems: { Item: buildItems(detalles) },
    },
  };
}

function buildE46(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, nombreExtranjero, paisExtranjero } = input;
  const total  = Number(factura.total);
  const fecha  = fmtFecha(factura.fecha ?? new Date());
  const emisor = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                  46,
          encf,
          fechaVencSec,
          indicadorMontoGravado: 0,
          tipoIngresos:          '01',
          tipoPago:              1,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorExtranjero(
          nombreExtranjero ?? (factura.cliente as any)?.nombre ?? 'Cliente Extranjero',
          paisExtranjero   ?? 'US',
        ),
        Totales: buildTotalesExentos(total),
      },
      DetallesItems: { Item: buildItems(factura.detalles as any[] ?? []) },
    },
  };
}

function buildE47(input: ECFBuildInput): MSellerPayload {
  const { encf, factura, config, fechaVencSec, nombreExtranjero, paisExtranjero } = input;
  const total  = Number(factura.total);
  const fecha  = fmtFecha(factura.fecha ?? new Date());
  const emisor = buildEmisor(toEmpresaConfig(config), fecha);
  assertEmisorOrder(emisor);

  return {
    ECF: {
      Encabezado: {
        Version: '1.0',
        IdDoc: buildIdDoc({
          tipo:                  47,
          encf,
          fechaVencSec,
          indicadorMontoGravado: 0,
          // SIN TipoIngresos en E47
          tipoPago:              1,
        }),
        Emisor:    emisor,
        Comprador: buildCompradorExtranjero(
          nombreExtranjero ?? (factura.cliente as any)?.nombre ?? 'Beneficiario Exterior',
          paisExtranjero   ?? 'US',
        ),
        Totales: buildTotalesExentos(total),
      },
      DetallesItems: { Item: buildItems(factura.detalles as any[] ?? []) },
    },
  };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

const BUILDERS: Record<number, (input: ECFBuildInput) => MSellerPayload> = {
  31: buildE31, 32: buildE32, 33: buildE33, 34: buildE34,
  41: buildE41, 43: buildE43, 44: buildE44, 45: buildE45,
  46: buildE46, 47: buildE47,
};

export function buildECF(tipoEcf: number, input: ECFBuildInput): MSellerPayload {
  const builder = BUILDERS[tipoEcf];
  if (!builder) {
    throw new Error(
      `No hay builder registrado para E${tipoEcf}. ` +
      `Soportados: ${Object.keys(BUILDERS).map(k => `E${k}`).join(', ')}`,
    );
  }
  return builder(input);
}

export const ECF_TIPOS_SOPORTADOS_LIST = Object.keys(BUILDERS).map(Number).sort((a, b) => a - b);
