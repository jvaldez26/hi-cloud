import { Injectable } from '@nestjs/common';
import { Factura } from '../../facturas/entities/factura.entity';
import { EmpresaEcfConfig } from '../entities/empresa-ecf-config.entity';
import { EcfRncRequeridoError } from '../errors/ecf.errors';

// ── Tipos del payload JSON que espera MSeller ─────────────────────────────────

export interface MSellerItem {
  NumeroLinea:           number;
  IndicadorFacturacion:  number; // 1=18% ITBIS, 2=16%, 4=Exento
  NombreItem:            string;
  IndicadorBienoServicio: number; // 1=Bien, 2=Servicio
  DescripcionItem?:      string;
  CantidadItem:          number;
  UnidadMedida:          number; // 43=Unidad
  PrecioUnitarioItem:    number;
  DescuentoMonto:        number;
  MontoItem:             number;
  TablaSubDescuento?: {
    SubDescuento: { TipoSubDescuento: string; SubDescuentoPorcentaje: number };
  };
}

export interface MSellerIdDoc {
  TipoeCF:                  number;
  eNCF:                     string;
  FechaVencimientoSecuencia: string; // DD-MM-YYYY
  IndicadorEnvioDiferido:   number;  // 0=inmediato
  IndicadorMontoGravado:    number;  // 1=hay gravado
  TipoIngresos:             string;  // '01'=Ingresos por Operaciones
  TipoPago:                 number;  // 1=Efectivo, 2=Crédito, 3=Tarjeta
  FechaLimitePago?:         string;
  TotalPaginas:             number;
}

export interface MSellerEmisor {
  RNCEmisor:         string;
  RazonSocialEmisor: string;
  NombreComercial?:  string;
  Sucursal?:         string;
  DireccionEmisor?:  string;
  Municipio?:        string;
  Provincia?:        string;
  FechaEmision:      string; // DD-MM-YYYY
}

export interface MSellerComprador {
  RNCComprador:         string;
  RazonSocialComprador: string;
  DireccionComprador?:  string;
}

export interface MSellerTotales {
  MontoGravadoTotal:  number;
  MontoGravadoI1:     number;
  MontoGravadoI2:     number;
  MontoExento:        number;
  ITBIS1:             number; // tasa 18
  ITBIS2:             number;
  TotalITBIS:         number;
  TotalITBIS1:        number;
  TotalITBIS2:        number;
  MontoTotal:         number;
  MontoNoFacturable:  number;
}

export interface MSellerPayload {
  ECF: {
    Encabezado: {
      Version:  '1.0';
      IdDoc:    MSellerIdDoc;
      Emisor:   MSellerEmisor;
      Comprador: MSellerComprador;
      Totales:  MSellerTotales;
    };
    DetallesItems: { Item: MSellerItem[] };
    FechaHoraFirma: string;
  };
}

/** Input normalizado que reciben todos los builders. */
export interface ECFBuildInput {
  encf:          string;
  factura:       Factura;
  config:        EmpresaEcfConfig;
  fechaVencSec:  Date;  // fecha de vencimiento de la secuencia
}

// ── Interfaz Strategy ─────────────────────────────────────────────────────────

export interface IECFBuilder {
  readonly tipoEcf: number;
  build(input: ECFBuildInput): MSellerPayload;
}

// ── Helpers de formato ────────────────────────────────────────────────────────

function fmtFecha(d: Date | string): string {
  const dt = d instanceof Date ? d : new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = dt.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Construye el bloque de items a partir de los detalles de la factura. */
function buildItems(factura: Factura): MSellerItem[] {
  return (factura.detalles ?? []).map((d, idx) => {
    const indicador = Number(d.porcentajeIva) === 18 ? 1
                    : Number(d.porcentajeIva) === 16 ? 2
                    : 4; // exento

    return {
      NumeroLinea:            idx + 1,
      IndicadorFacturacion:   indicador,
      NombreItem:             d.descripcion,
      IndicadorBienoServicio: 1, // bien — se puede extender con campo en detalle
      CantidadItem:           d.cantidad,
      UnidadMedida:           43,
      PrecioUnitarioItem:     round2(Number(d.precioUnitario)),
      DescuentoMonto:         0,
      MontoItem:              round2(Number(d.subtotal)),
      TablaSubDescuento: {
        SubDescuento: { TipoSubDescuento: '01', SubDescuentoPorcentaje: 0 },
      },
    };
  });
}

/** Calcula los totales desde los detalles de la factura. */
function buildTotales(factura: Factura): MSellerTotales {
  let gravado18 = 0, gravado16 = 0, exento = 0, itbis18 = 0, itbis16 = 0;

  for (const d of (factura.detalles ?? [])) {
    const pct = Number(d.porcentajeIva);
    if (pct === 18) { gravado18 += Number(d.subtotal); itbis18 += Number(d.importeIva); }
    else if (pct === 16) { gravado16 += Number(d.subtotal); itbis16 += Number(d.importeIva); }
    else { exento += Number(d.subtotal); }
  }

  return {
    MontoGravadoTotal:  round2(gravado18 + gravado16),
    MontoGravadoI1:     round2(gravado18),
    MontoGravadoI2:     round2(gravado16),
    MontoExento:        round2(exento),
    ITBIS1:             18,
    ITBIS2:             16,
    TotalITBIS:         round2(itbis18 + itbis16),
    TotalITBIS1:        round2(itbis18),
    TotalITBIS2:        round2(itbis16),
    MontoTotal:         round2(Number(factura.total)),
    MontoNoFacturable:  0,
  };
}

// ── E31: Factura de Crédito Fiscal ────────────────────────────────────────────

class ECFBuilder31 implements IECFBuilder {
  readonly tipoEcf = 31;

  build({ encf, factura, config, fechaVencSec }: ECFBuildInput): MSellerPayload {
    const cliente = factura.cliente;

    // RNC del comprador es obligatorio en E31
    const rncComprador = cliente?.rncReceptor ?? cliente?.rfc;
    if (!rncComprador) {
      throw new EcfRncRequeridoError(31, Number(factura.total));
    }

    const emisor: MSellerEmisor = {
      RNCEmisor:         config.rncEmisor!,
      RazonSocialEmisor: config.razonSocialEmisor!,
      NombreComercial:   config.nombreComercial,
      DireccionEmisor:   config.direccionEmisor,
      Municipio:         config.municipio,
      Provincia:         config.provincia,
      FechaEmision:      fmtFecha(factura.fecha ?? new Date()),
    };

    const comprador: MSellerComprador = {
      RNCComprador:         rncComprador,
      RazonSocialComprador: cliente?.nombre ?? 'Sin nombre',
      DireccionComprador:   cliente?.direccion,
    };

    return {
      ECF: {
        Encabezado: {
          Version: '1.0',
          IdDoc: {
            TipoeCF:                  31,
            eNCF:                     encf,
            FechaVencimientoSecuencia: fmtFecha(fechaVencSec),
            IndicadorEnvioDiferido:   0,
            IndicadorMontoGravado:    1,
            TipoIngresos:             '01',
            TipoPago:                 1,
            TotalPaginas:             1,
          },
          Emisor:    emisor,
          Comprador: comprador,
          Totales:   buildTotales(factura),
        },
        DetallesItems:  { Item: buildItems(factura) },
        FechaHoraFirma: '',
      },
    };
  }
}

// ── E32: Factura de Consumo ───────────────────────────────────────────────────

const MONTO_RNC_OBLIGATORIO_E32 = 250_000; // DOP

class ECFBuilder32 implements IECFBuilder {
  readonly tipoEcf = 32;

  build({ encf, factura, config, fechaVencSec }: ECFBuildInput): MSellerPayload {
    const cliente = factura.cliente;
    const total   = Number(factura.total);

    const rncComprador = cliente?.rncReceptor ?? cliente?.rfc;

    // Si monto >= 250K se requiere identificación del comprador
    if (total >= MONTO_RNC_OBLIGATORIO_E32 && !rncComprador) {
      throw new EcfRncRequeridoError(32, total);
    }

    const emisor: MSellerEmisor = {
      RNCEmisor:         config.rncEmisor!,
      RazonSocialEmisor: config.razonSocialEmisor!,
      NombreComercial:   config.nombreComercial,
      DireccionEmisor:   config.direccionEmisor,
      Municipio:         config.municipio,
      Provincia:         config.provincia,
      FechaEmision:      fmtFecha(factura.fecha ?? new Date()),
    };

    // Para consumo sin RNC se usa "00000000000" (11 ceros)
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
            TipoeCF:                  32,
            eNCF:                     encf,
            FechaVencimientoSecuencia: fmtFecha(fechaVencSec),
            IndicadorEnvioDiferido:   0,
            IndicadorMontoGravado:    totales.MontoGravadoTotal > 0 ? 1 : 0,
            TipoIngresos:             '01',
            TipoPago:                 1,
            TotalPaginas:             1,
          },
          Emisor:    emisor,
          Comprador: comprador,
          Totales:   totales,
        },
        DetallesItems:  { Item: buildItems(factura) },
        FechaHoraFirma: '',
      },
    };
  }
}

// ── Servicio orquestador (Strategy registry) ──────────────────────────────────

@Injectable()
export class ECFBuilderService {
  private readonly builders = new Map<number, IECFBuilder>();

  constructor() {
    this.register(new ECFBuilder31());
    this.register(new ECFBuilder32());
    // Para agregar E33, E34, etc.: this.register(new ECFBuilder33());
  }

  private register(builder: IECFBuilder): void {
    this.builders.set(builder.tipoEcf, builder);
  }

  /**
   * Construye el payload JSON para MSeller según el tipo de e-CF.
   * Lanza EcfRncRequeridoError si faltan datos obligatorios.
   */
  build(tipoEcf: number, input: ECFBuildInput): MSellerPayload {
    const builder = this.builders.get(tipoEcf);
    if (!builder) {
      throw new Error(`No hay builder registrado para el tipo E${tipoEcf}. ` +
        `Tipos soportados: ${[...this.builders.keys()].map(k => `E${k}`).join(', ')}`);
    }
    return builder.build(input);
  }

  /** Lista de tipos de e-CF soportados por el builder. */
  getTiposSoportados(): number[] {
    return [...this.builders.keys()].sort((a, b) => a - b);
  }
}
