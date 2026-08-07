import { Injectable } from '@nestjs/common';
import { esRncValido, esCedulaValida, tipoIdDgii, fechaDgii } from './dgii.constants';

export type NivelValidacion = 'error' | 'advertencia';

export interface ResultadoValidacion {
  nivel:     NivelValidacion;
  campo:     string;
  mensaje:   string;
  referencia: string;  // NCF, folio, o ID del registro
  ruta?:     string;   // ruta frontend para corregir
}

/** Gasto del período que no entró al 606 por campos fiscales incompletos */
export interface GastoExcluido {
  id:          number;
  descripcion: string;
  categoria:   string;
  fecha:       string;
  total:       number;
  motivos:     string[];  // ej. ['Sin NCF del proveedor', 'Sin tipo de bienes']
}

export interface ResumenValidacion {
  valido:           boolean;         // false si hay al menos 1 error
  errores:          ResultadoValidacion[];
  advertencias:     ResultadoValidacion[];
  totalLineas:      number;
  lineasOk:         number;
  /** Solo presente en la validación del 606 — gastos excluidos por datos incompletos */
  gastosExcluidos?: GastoExcluido[];
}

@Injectable()
export class DgiiValidatorService {

  /** Valida un lote de registros 606 */
  validar606(filas: Fila606[]): ResumenValidacion {
    const errores:      ResultadoValidacion[] = [];
    const advertencias: ResultadoValidacion[] = [];

    for (const f of filas) {
      const ref = f.ncfProveedor || f.folio || `Línea ${f.linea}`;

      // ── Errores que bloquean exportación ─────────────────────────────────

      // La ruta de corrección depende de si la fila viene de compras o gastos
      const rutaBase = f.source === 'gasto' ? `/gastos` : `/compras/${f.id}`;

      // RNC/cédula del proveedor obligatorio y válido
      if (!f.rncProveedor) {
        errores.push({ nivel: 'error', campo: 'RNC proveedor', referencia: ref,
          mensaje: 'Proveedor sin RNC/Cédula — requerido por DGII',
          ruta: rutaBase });
      } else {
        const tipo = tipoIdDgii(f.rncProveedor);
        if (tipo === '') {
          errores.push({ nivel: 'error', campo: 'RNC proveedor', referencia: ref,
            mensaje: `RNC "${f.rncProveedor}" no tiene formato válido (9 dígitos RNC, 11 cédula)`,
            ruta: rutaBase });
        }
      }

      // NCF del proveedor — si monto > 50 debe tener NCF
      if (!f.ncfProveedor && Number(f.montoFacturado) > 5000) {
        errores.push({ nivel: 'error', campo: 'NCF proveedor', referencia: ref,
          mensaje: 'Compra mayor a RD$50 sin NCF del proveedor',
          ruta: rutaBase });
      }

      // Monto negativo
      if (Number(f.montoFacturado) < 0) {
        errores.push({ nivel: 'error', campo: 'Monto', referencia: ref,
          mensaje: 'Monto facturado no puede ser negativo' });
      }

      // ITBIS mayor al 18% del monto
      const itbisMaximo = Number(f.montoFacturado) * 0.185;
      if (Number(f.itbis) > itbisMaximo && Number(f.itbis) > 0) {
        errores.push({ nivel: 'error', campo: 'ITBIS', referencia: ref,
          mensaje: `ITBIS (${f.itbis}) mayor al 18.5% del monto (${f.montoFacturado})` });
      }

      // Fecha de pago anterior a fecha del comprobante (solo aplica a compras con fechaPago real)
      if (f.fechaPago && f.fechaComprobante && f.source !== 'gasto') {
        const fp = new Date(f.fechaPago);
        const fc = new Date(f.fechaComprobante);
        if (fp < fc) {
          errores.push({ nivel: 'error', campo: 'Fecha de pago', referencia: ref,
            mensaje: 'Fecha de pago es anterior a la fecha del comprobante',
            ruta: rutaBase });
        }
      }

      // ── Advertencias (no bloquean) ────────────────────────────────────────

      if (!f.tipoBienes) {
        advertencias.push({ nivel: 'advertencia', campo: 'Tipo de bienes', referencia: ref,
          mensaje: 'Sin clasificación de tipo de bienes/servicios — se usará 09',
          ruta: rutaBase });
      }

      if (!f.fechaPago && f.source !== 'gasto') {
        advertencias.push({ nivel: 'advertencia', campo: 'Fecha de pago', referencia: ref,
          mensaje: 'Sin fecha de pago — se usará fecha del comprobante' });
      }

      // NCF que no empieza por 'E' podría ser formato antiguo (no e-CF)
      if (f.ncfProveedor && !f.ncfProveedor.startsWith('E') && !f.ncfProveedor.startsWith('B')) {
        advertencias.push({ nivel: 'advertencia', campo: 'NCF proveedor', referencia: ref,
          mensaje: `NCF "${f.ncfProveedor}" no tiene formato e-CF (E) ni B-válido` });
      }
    }

    const totalLineas = filas.length;
    const lineasConError = new Set(errores.map(e => e.referencia)).size;
    return {
      valido: errores.length === 0,
      errores,
      advertencias,
      totalLineas,
      lineasOk: totalLineas - lineasConError,
    };
  }

  /** Valida un lote de registros 607 */
  validar607(filas: Fila607[]): ResumenValidacion {
    const errores:      ResultadoValidacion[] = [];
    const advertencias: ResultadoValidacion[] = [];

    for (const f of filas) {
      const ref = f.encf || f.folio || `Línea ${f.linea}`;

      // ── Errores ───────────────────────────────────────────────────────────

      // eNCF obligatorio
      if (!f.encf) {
        errores.push({ nivel: 'error', campo: 'eNCF', referencia: ref,
          mensaje: 'Factura sin e-CF emitido — no se puede incluir en el 607',
          ruta: `/facturas/${f.id}` });
      }

      // Monto negativo (deben ir al 608)
      if (Number(f.montoFacturado) < 0) {
        errores.push({ nivel: 'error', campo: 'Monto', referencia: ref,
          mensaje: 'Monto negativo — las anulaciones van en el 608' });
      }

      // ITBIS inconsistente
      const itbisEsperado = Number(f.montoFacturado) * 0.18;
      if (Number(f.itbis) > 0 && Math.abs(Number(f.itbis) - itbisEsperado) > itbisEsperado * 0.05) {
        errores.push({ nivel: 'error', campo: 'ITBIS', referencia: ref,
          mensaje: `ITBIS (${f.itbis}) difiere más del 5% del esperado (${itbisEsperado.toFixed(2)})` });
      }

      // ── Advertencias ─────────────────────────────────────────────────────

      // e-CF no ACEPTADO por DGII
      if (f.encf && f.estadoDgii && !['ACEPTADO'].includes(f.estadoDgii.toUpperCase())) {
        advertencias.push({ nivel: 'advertencia', campo: 'Estado e-CF', referencia: ref,
          mensaje: `e-CF en estado "${f.estadoDgii}" — DGII puede rechazar el 607` });
      }

      // Comprador con RNC pero tipo NCF es E32 (consumo, no crédito fiscal)
      if (f.rncComprador && esRncValido(f.rncComprador) && f.tipoNcf === 'E32') {
        advertencias.push({ nivel: 'advertencia', campo: 'Tipo NCF', referencia: ref,
          mensaje: `Comprador con RNC usa E32 (consumo). Para crédito fiscal debe ser E31`,
          ruta: `/facturas/${f.id}` });
      }

      // RNC comprador con formato inválido (si viene)
      if (f.rncComprador) {
        const tipo = tipoIdDgii(f.rncComprador);
        if (tipo === '') {
          advertencias.push({ nivel: 'advertencia', campo: 'RNC comprador', referencia: ref,
            mensaje: `RNC/Cédula del comprador con formato no reconocido: "${f.rncComprador}"` });
        }
      }
    }

    const totalLineas = filas.length;
    const lineasConError = new Set(errores.map(e => e.referencia)).size;
    return {
      valido: errores.length === 0,
      errores,
      advertencias,
      totalLineas,
      lineasOk: totalLineas - lineasConError,
    };
  }

  /** Valida un lote de registros 608 */
  validar608(filas: Fila608[]): ResumenValidacion {
    const errores:      ResultadoValidacion[] = [];
    const advertencias: ResultadoValidacion[] = [];

    for (const f of filas) {
      const ref = f.ncf || `Línea ${f.linea}`;

      if (!f.ncf) {
        errores.push({ nivel: 'error', campo: 'NCF', referencia: ref,
          mensaje: 'Comprobante anulado sin NCF' });
      }

      if (f.fechaAnulacion && f.fechaComprobante) {
        const fa = new Date(f.fechaAnulacion);
        const fc = new Date(f.fechaComprobante);
        if (fa < fc) {
          errores.push({ nivel: 'error', campo: 'Fecha anulación', referencia: ref,
            mensaje: 'Fecha de anulación es anterior a la fecha del comprobante' });
        }
      }

      if (!f.fechaAnulacion) {
        advertencias.push({ nivel: 'advertencia', campo: 'Fecha anulación', referencia: ref,
          mensaje: 'Sin fecha de anulación — se usará fecha actual' });
      }
    }

    const totalLineas = filas.length;
    const lineasConError = new Set(errores.map(e => e.referencia)).size;
    return {
      valido: errores.length === 0,
      errores,
      advertencias,
      totalLineas,
      lineasOk: totalLineas - lineasConError,
    };
  }
}

// ── Tipos de filas para el validador ─────────────────────────────────────────

export interface Fila606 {
  linea:           number;
  id:              number;
  folio:           string;
  /** 'compra' (fuente principal) o 'gasto' (gasto operativo con comprobante fiscal) */
  source?:         'compra' | 'gasto';
  rncProveedor?:   string;
  ncfProveedor?:   string;
  tipoBienes?:     string;
  fechaComprobante?: Date | string;
  fechaPago?:      Date | string;
  montoFacturado:  number;
  itbis:           number;
}

export interface Fila607 {
  linea:           number;
  id:              number;
  folio:           string;
  encf?:           string;
  tipoNcf?:        string;
  estadoDgii?:     string;
  rncComprador?:   string;
  fechaComprobante?: Date | string;
  montoFacturado:  number;
  itbis:           number;
}

export interface Fila608 {
  linea:           number;
  ncf?:            string;
  fechaComprobante?: Date | string;
  fechaAnulacion?: Date | string;
}
