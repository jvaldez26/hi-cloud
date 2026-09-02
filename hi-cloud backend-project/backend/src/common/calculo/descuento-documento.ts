import { BadRequestException } from '@nestjs/common';

/**
 * Cálculo de descuentos e ITBIS de un documento comercial.
 *
 * Extraído literalmente de `facturas.service.ts` (create() y actualizar(), que
 * tenían el mismo bloque duplicado). Es la ÚNICA fuente del cálculo para
 * factura, cotización, pro-forma y pre-factura: si cada documento calcula el
 * mismo dinero por su cuenta, el total cambia al convertir uno en otro y eso
 * es una discusión con el cliente.
 *
 * No toca base de datos, no valida precios contra el catálogo y no sabe de
 * productos: recibe líneas ya normalizadas y devuelve importes. Todo lo demás
 * (revalidar precio contra costo, resolver el producto, el costo promedio)
 * sigue siendo responsabilidad de quien llama.
 */

/** Redondeo a 2 decimales — el mismo `r2` que vivía en facturas.service.ts */
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface LineaDescuentoInput {
  /** Solo para el mensaje de error del invariante de la convención B */
  descripcion?: string;
  cantidad: number;
  precioUnitario: number;
  /** Presente ⇒ convención B (POS): precioUnitario ya viene neto */
  precioOriginal?: number | null;
  descuentoPct?: number | null;
  descuentoMonto?: number | null;
  porcentajeIva: number;
}

export interface LineaDescuentoOutput {
  /** Base imponible de la línea, ya neta de descuento de línea Y del reparto del general */
  subtotal: number;
  importeIva: number;
  total: number;
  /** Descuento propio de la línea (sin el reparto del general). Informativo. */
  descuentoLinea: number;
  /** Parte del descuento general que le tocó a esta línea. Informativo. */
  descuentoGeneralProrrateado: number;
}

export interface TotalesDocumento {
  lineas: LineaDescuentoOutput[];
  /** Suma de subtotales de línea ANTES del descuento general */
  subtotalBase: number;
  /** Descuento general efectivamente aplicado, en base imponible */
  descuentoGeneral: number;
  subtotal: number;
  iva: number;
  total: number;
}

export interface DescuentoGeneralInput {
  /** 'monto' = RD$ fijo sobre el subtotal | 'porcentaje' = % sobre el subtotal */
  tipo?: string | null;
  /** Importe en BASE imponible, o el porcentaje */
  valor?: number | null;
}

/**
 * Contrato de descuento por línea — hay DOS convenciones y ambas están vivas
 * en producción:
 *
 * Convención A — Facturas regular (sin precioOriginal):
 *   precioUnitario = precio BRUTO antes de descuento
 *   descuentoMonto = descuento TOTAL de la línea
 *   subtotal = precioUnitario × cantidad − descuentoMonto
 *
 * Convención B — POS con descuento por ítem (precioOriginal presente):
 *   precioUnitario = precio NETO ya descontado por unidad
 *   precioOriginal = precio BRUTO original por unidad
 *   descuentoMonto = descuento POR UNIDAD (no por línea)
 *   Invariante: precioOriginal − descuentoMonto ≈ precioUnitario (±0.05)
 *   subtotal = precioOriginal × cantidad − descuentoMonto × cantidad
 *            = precioUnitario × cantidad  (descuento ya está en precio)
 *
 * El descuento general se reparte proporcionalmente al subtotal de cada línea
 * y el ITBIS se recalcula sobre la base ya descontada, usando la base cruda sin
 * redondeo intermedio (`baseRaw`) para no desviarse un centavo.
 */
/**
 * Invariante de la convención B: `precioOriginal − descuentoMonto ≈ precioUnitario`
 * (±0.05). Se expone aparte porque quien llama valida las líneas una a una —
 * precio contra catálogo, precio contra costo — y el orden en que salen los
 * errores es parte del comportamiento. `calcularTotalesConDescuento` la vuelve a
 * aplicar: es idempotente y sin efectos.
 */
export function validarInvarianteConvencionB(item: LineaDescuentoInput): void {
  const dm = Number(item.descuentoMonto ?? 0);
  if (item.precioOriginal == null || dm <= 0) return;

  const precioOrig = Number(item.precioOriginal);
  const precioNeto = Number(item.precioUnitario);
  const diff = Math.abs((precioOrig - dm) - precioNeto);
  if (diff > 0.05) {
    throw new BadRequestException(
      `[precio] "${item.descripcion ?? 'ítem'}": ` +
      `precioOriginal (${precioOrig}) − descuentoMonto (${dm}) ≠ precioUnitario (${precioNeto}) ` +
      `(diff=${diff.toFixed(4)}). El precio enviado ya incluye el descuento.`,
    );
  }
}

export function calcularTotalesConDescuento(
  lineas: LineaDescuentoInput[],
  descuentoGeneral: DescuentoGeneralInput = {},
): TotalesDocumento {
  const calculadas: Array<{
    subtotal: number;
    baseRaw: number;
    porcentajeIva: number;
    descuentoLinea: number;
  }> = [];

  let subtotalBase = 0;

  for (const item of lineas) {
    const dm = Number(item.descuentoMonto ?? 0);
    const dp = Number(item.descuentoPct ?? 0);

    let precioRaw: number;
    let descLinea = 0;

    if (item.precioOriginal != null && dm > 0) {
      // Convención B: base desde precioOriginal; descuento = dm × cantidad
      validarInvarianteConvencionB(item);
      const precioOrig = Number(item.precioOriginal);
      precioRaw = precioOrig * item.cantidad;
      descLinea = r2(dm * item.cantidad);
    } else {
      // Convención A: base desde precioUnitario; descuentoMonto es total de la línea
      precioRaw = Number(item.precioUnitario) * item.cantidad;
      const brutoA = r2(precioRaw);
      if (dm > 0) {
        descLinea = r2(Math.min(dm, brutoA));
      } else if (dp > 0) {
        descLinea = r2(brutoA * (dp / 100));
      }
    }

    const bruto = r2(precioRaw);
    const subtotalLinea = r2(bruto - descLinea);
    subtotalBase += subtotalLinea;

    calculadas.push({
      subtotal: subtotalLinea,
      // Base sin redondeo intermedio para calcular el IVA con precisión completa
      baseRaw: precioRaw - descLinea,
      porcentajeIva: Number(item.porcentajeIva),
      descuentoLinea: descLinea,
    });
  }

  subtotalBase = r2(subtotalBase);

  // Descuento general sobre el subtotal acumulado
  let descGeneral = 0;
  const dgt = descuentoGeneral.tipo;
  const dgv = Number(descuentoGeneral.valor ?? 0);
  if (dgt === 'monto' && dgv > 0) {
    descGeneral = r2(Math.min(dgv, subtotalBase));
  } else if (dgt === 'porcentaje' && dgv > 0) {
    descGeneral = r2(subtotalBase * (dgv / 100));
  }

  // Distribuir descuento general proporcionalmente y recalcular IVA por línea
  const salida: LineaDescuentoOutput[] = [];
  let subtotalDoc = 0;
  let ivaDoc = 0;

  for (const d of calculadas) {
    const subtotNeto = d.subtotal;
    // Proporción de este detalle sobre el total pre-desc-general
    const descProp = subtotalBase > 0
      ? r2((subtotNeto / subtotalBase) * descGeneral)
      : 0;
    const subtotFinal = r2(subtotNeto - descProp);
    // IVA sobre base cruda (sin redondeo intermedio) para evitar error de ±1 centavo
    const rawFinal = subtotNeto > 0 ? d.baseRaw * (subtotFinal / subtotNeto) : subtotFinal;
    const ivaLinea = r2(rawFinal * (d.porcentajeIva / 100));

    salida.push({
      subtotal:   subtotFinal,
      importeIva: ivaLinea,
      total:      r2(subtotFinal + ivaLinea),
      descuentoLinea: d.descuentoLinea,
      descuentoGeneralProrrateado: descProp,
    });

    subtotalDoc += subtotFinal;
    ivaDoc      += ivaLinea;
  }

  subtotalDoc = r2(subtotalDoc);
  ivaDoc      = r2(ivaDoc);

  return {
    lineas: salida,
    subtotalBase,
    descuentoGeneral: descGeneral,
    subtotal: subtotalDoc,
    iva:      ivaDoc,
    total:    r2(subtotalDoc + ivaDoc),
  };
}
