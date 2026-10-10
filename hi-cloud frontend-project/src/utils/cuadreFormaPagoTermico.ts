/**
 * Bloque "CUADRE POR FORMA DE PAGO" del ticket térmico del cierre de caja.
 *
 * Igual que bloqueFacturasTermico (cierreFacturasTermico.ts): vive aquí y no
 * dentro de cada pantalla porque hay varias plantillas que imprimen el mismo
 * cierre — el recibo inmediato del POS al cerrar (POSPage.tsx) y las dos del
 * panel de Caja (CajaPage.tsx: ticket simple y ticket con detalle) — y deben
 * salir idénticas.
 *
 * Los datos vienen del cierre tal cual lo devuelve el backend
 * (`cuadrePorFormaPago`/`sospechasFormaPago`/`facturasSinFormaPago`/
 * `cuadreCorregido`/los campos `*Original` del recierre, ver
 * cuadre-por-forma-pago.util.ts y caja.service.ts) — aquí no se calcula
 * ningún monto, solo se formatea.
 *
 * TODO el bloque (tabla, aviso, candidatas, facturas sin forma, recierre) es
 * texto de ANCHO FIJO, línea por línea — ninguna línea, en ningún sub-bloque,
 * puede pasar del ancho medido del papel (requisito explícito 2026-10-10,
 * tras el primer rediseño: "ninguna línea fuera de la tabla puede pasar del
 * ancho medido"). El ancho se MIDIÓ con Chrome headless (Courier New bold
 * 8pt dentro del papel configurado — ver docTermico.ts, que mide la fuente
 * NORMAL del ticket igual: 24/30): 30 caracteres a 58mm, 41 a 80mm/bluetooth/
 * carta/ninguna. Sin medir, se repite el bug que ya truncó un e-NCF en este
 * mismo ticket por usar un ancho supuesto.
 *
 * Cada línea es un <div> de texto plano SIN <span> — proc() (thermalPrinter.ts,
 * impresión Bluetooth) no la trata como ".row" (que exige exactamente 2
 * columnas y perdería cualquier columna de más) sino como una hoja de texto
 * normal, y la envía tal cual por ESC/POS. Todo el texto libre (nombres,
 * folios, desgloses) pasa por `envolver()`/`lineaLR()`/`centrar()`
 * (thermalPrinter.ts) antes de convertirse en línea: además de respetar el
 * ancho, esas tres funciones ya bajan tildes y caracteres especiales
 * (sanear()) — requisito explícito: ni el texto fijo ni los datos (nombre de
 * cliente, de cajero) llevan tildes ni "·" en ningún canal, ni siquiera en el
 * HTML que renderiza el navegador (antes solo se bajaban camino a Bluetooth).
 *
 * En el navegador (ticket/PDF), el relleno con espacios se preserva con
 * `white-space:pre` en `.cf-bloque` (ver el CSS al final del archivo) — sin
 * eso, un navegador real colapsa los espacios repetidos a uno solo y
 * desalinea las columnas.
 */

import { estadoDiferencia } from './diferenciaCaja';
import { sanear, envolver, lineaLR, centrar } from '../services/thermalPrinter';

export interface FilaCuadreTermico {
  forma:      string;
  esperado:   number;
  declarado:  number;
  diferencia: number;
}

export interface FacturaSinFormaTermico { id: number; folio: string; total: number; clienteNombre?: string }
export interface SospechaFormaTermico {
  formaSobrante: string; formaFaltante: string;
  montoSobrante: number; montoFaltante: number;
  facturasCandidatas?: { id: number; folio: string; total: number; formasPago?: { tipo: number; monto: number }[] }[];
}

export interface CierreConCuadreTermico {
  cuadrePorFormaPago?:  FilaCuadreTermico[];
  cuadreCorregido?:     FilaCuadreTermico[];
  cuadreEstimado?:      boolean;
  sospechasFormaPago?:  SospechaFormaTermico[];
  facturasSinFormaPago?: FacturaSinFormaTermico[];
  // Preservados en el PRIMER cierre al recerrar (ver anularCierre() en
  // caja.service.ts) — si existen, este cierre fue recerrado.
  saldoFisico?:                number;
  contadoOriginal?:             number;
  cuadrePorFormaPagoOriginal?:  FilaCuadreTermico[];
  facturasSinFormaPagoOriginal?: FacturaSinFormaTermico[];
}

/** Nombres completos — usados en el aviso y en la tabla a 80mm (hay espacio de sobra). */
const LABEL_FORMA: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transfer.', otros: 'Otros',
};

/** Nombres cortos — SOLO la tabla a 58mm, donde "Transferencia"/"Efectivo" no entran en 7 caracteres. */
const LABEL_FORMA_CORTA: Record<string, string> = {
  efectivo: 'Efect.', tarjeta: 'Tarjeta', transferencia: 'Transf.', otros: 'Otros',
};

/** Tipo DGII de formasPago (ver cuadre-por-forma-pago.util.ts, backend) → nombre corto para el desglose de una candidata. */
const LABEL_TIPO_DGII: Record<number, string> = {
  1: 'Efectivo', 2: 'Transfer.', 3: 'Tarjeta', 4: 'Crédito', 5: 'Permuta', 6: 'NC',
};

const escHtml = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Configuración de ancho (tabla Y el resto del bloque comparten el mismo
// ancho medido — requisito explícito: "ninguna línea fuera de la tabla
// puede pasar del ancho medido") ────────────────────────────────────────────

interface ConfigTabla {
  ancho: number;
  comas: boolean;
  wForma: number; wEsp: number; wCon: number; wDif: number;
  gap1: string; gap2: string; gap3: string;
  headerEsp: string;
  labels: Record<string, string>;
}

// 58mm: 30 caracteres de ancho útil medidos a 8pt (ver cabecera del archivo).
// FORMA necesita 7 (cabe "Tarjeta"/"Transf."); los 3 montos se llevan los 23
// restantes. gap3 va vacío a propósito: Contado y Difer. quedan pegados SOLO
// cuando Difer. mide exactamente 7 (su peor caso), y Difer. siempre lleva un
// signo ('+'/'-') al frente — ese signo, no un espacio, es lo que separa
// visualmente los dos números. Cuando Difer. mide menos de 7 (el caso común),
// padStart ya le pone el espacio de relleno delante.
const TABLA_58MM: ConfigTabla = {
  ancho: 30, comas: false,
  wForma: 7, wEsp: 7, wCon: 7, wDif: 7,
  gap1: ' ', gap2: ' ', gap3: '',
  headerEsp: 'ESPER.',
  labels: LABEL_FORMA_CORTA,
};

// 80mm / bluetooth / carta / ninguna: 41 caracteres medidos a 8pt. Hay
// espacio de sobra para nombres completos, comas de miles y un espacio real
// entre cada columna.
const TABLA_80MM: ConfigTabla = {
  ancho: 41, comas: true,
  wForma: 9, wEsp: 10, wCon: 10, wDif: 9,
  gap1: ' ', gap2: ' ', gap3: ' ',
  headerEsp: 'ESPERADO',
  labels: LABEL_FORMA,
};

function configTabla(tipoImpresora?: string): ConfigTabla {
  return tipoImpresora === '58mm' || tipoImpresora === 'bluetooth' ? TABLA_58MM : TABLA_80MM;
}

/** Monto — sin "RD$", con o sin comas de miles según el ancho del papel. */
function moneyTabla(v: number, comas: boolean): string {
  const n    = Number(v ?? 0);
  const sign = n < 0 ? '-' : '';
  const abs  = Math.abs(n).toFixed(2);
  if (!comas) return sign + abs;
  const [ent, dec] = abs.split('.');
  return sign + Number(ent).toLocaleString('en-US') + '.' + dec;
}

/** La diferencia SIEMPRE lleva signo — es el separador visual cuando queda pegada a Contado (ver TABLA_58MM). */
function difTabla(v: number, comas: boolean): string {
  const n = Number(v ?? 0);
  return (n >= 0 ? '+' : '') + moneyTabla(n, comas);
}

/** "Tarjeta 955.00 / Efectivo 125.00" — el desglose real de la factura candidata, lo que explica la sospecha. */
function desgloseFormasPago(fps: { tipo: number; monto: number }[] | undefined, comas: boolean): string {
  if (!fps?.length) return '';
  return fps.map(fp => `${LABEL_TIPO_DGII[fp.tipo] ?? `T${fp.tipo}`} ${moneyTabla(Number(fp.monto), comas)}`).join(' / ');
}

/**
 * Una fila de la tabla. Si algún monto no entra en su columna, la fila NUNCA
 * se corta ni se pega a la columna vecina: pasa a varias líneas, una por
 * cada monto que no cupo, con su propia etiqueta.
 */
function filaTabla(cfg: ConfigTabla, label: string, esperado: number, contado: number, diferencia: number): string[] {
  const fEsp = moneyTabla(esperado, cfg.comas);
  const fCon = moneyTabla(contado, cfg.comas);
  const fDif = difTabla(diferencia, cfg.comas);
  const cabe = fEsp.length <= cfg.wEsp && fCon.length <= cfg.wCon && fDif.length <= cfg.wDif;

  if (cabe) {
    return [
      label.padEnd(cfg.wForma) + cfg.gap1 + fEsp.padStart(cfg.wEsp) +
      cfg.gap2 + fCon.padStart(cfg.wCon) + cfg.gap3 + fDif.padStart(cfg.wDif),
    ];
  }

  const primera =
    label.padEnd(cfg.wForma) + cfg.gap1 + (fEsp.length <= cfg.wEsp ? fEsp.padStart(cfg.wEsp) : ' '.repeat(cfg.wEsp)) +
    cfg.gap2 + (fCon.length <= cfg.wCon ? fCon.padStart(cfg.wCon) : ' '.repeat(cfg.wCon)) +
    cfg.gap3 + (fDif.length <= cfg.wDif ? fDif.padStart(cfg.wDif) : ' '.repeat(cfg.wDif));
  const extra: string[] = [];
  if (fEsp.length > cfg.wEsp) extra.push(...envolver(`  Esperado: ${fEsp}`, cfg.ancho));
  if (fCon.length > cfg.wCon) extra.push(...envolver(`  Contado: ${fCon}`, cfg.ancho));
  if (fDif.length > cfg.wDif) extra.push(...envolver(`  Difer.: ${fDif}`, cfg.ancho));
  return [primera, ...extra];
}

/** Encabezado + filas (con movimiento o declaración) + TOTAL + leyenda + resultado. Todas las líneas miden exactamente cfg.ancho. */
function tablaCuadre(filas: FilaCuadreTermico[], cfg: ConfigTabla): string[] {
  const header =
    'FORMA'.padEnd(cfg.wForma) + cfg.gap1 + cfg.headerEsp.padStart(cfg.wEsp) +
    cfg.gap2 + 'CONTADO'.padStart(cfg.wCon) + cfg.gap3 + 'DIFER.'.padStart(cfg.wDif);
  const sep = '-'.repeat(cfg.ancho);

  const lineas: string[] = [header, sep];
  let sEsp = 0, sCon = 0, sDif = 0;
  for (const f of filas) {
    // Sin movimiento esperado ni declarado: no aporta nada a la tabla.
    if (Math.abs(f.esperado) < 0.005 && Math.abs(f.declarado) < 0.005 && Math.abs(f.diferencia) < 0.005) continue;
    lineas.push(...filaTabla(cfg, cfg.labels[f.forma] ?? f.forma, f.esperado, f.declarado, f.diferencia));
    sEsp += Number(f.esperado || 0);
    sCon += Number(f.declarado || 0);
    sDif += Number(f.diferencia || 0);
  }
  lineas.push(sep);
  lineas.push(...filaTabla(cfg, 'TOTAL', sEsp, sCon, sDif));

  const estado = estadoDiferencia(sDif);
  const resultado =
    estado === 'cuadrado' ? 'RESULTADO: CUADRA'
    : estado === 'sobrante' ? `RESULTADO: SOBRAN RD$${moneyTabla(Math.abs(sDif), cfg.comas)}`
    : `RESULTADO: FALTAN RD$${moneyTabla(Math.abs(sDif), cfg.comas)}`;

  lineas.push(...envolver('(+) sobra   (-) falta', cfg.ancho));
  lineas.push(...envolver(resultado, cfg.ancho));
  return lineas;
}

/** Línea con un monto ya formateado, alineada a la derecha dentro de `ancho`. El monto es puro ASCII — nunca necesita envolver()/sanear(). */
function montoDerecha(monto: string, ancho: number): string {
  return monto.length >= ancho ? monto : ' '.repeat(ancho - monto.length) + monto;
}

/** folio / detalle (envuelto en 1+ líneas) / monto a la derecha — el formato de 3 líneas de una candidata o una factura sin forma de pago. */
function filasItemConMonto(folio: string, detalle: string | undefined, monto: string, cfg: ConfigTabla): string[] {
  const lineas = [...envolver(folio, cfg.ancho)];
  if (detalle) lineas.push(...envolver(detalle, cfg.ancho));
  lineas.push(montoDerecha(monto, cfg.ancho));
  return lineas;
}

/** Título de sección — envuelto y centrado si no entra en una sola línea. */
function tituloCentrado(texto: string, ancho: number): string[] {
  return envolver(texto, ancho).map(l => centrar(l, ancho));
}

export interface BloqueCuadreOpts {
  /** '58mm' | '80mm' | 'bluetooth' | 'carta' | 'ninguna' — decide ancho, comas y nombres cortos/completos. */
  tipoImpresora?: string;
}

/** Devuelve el HTML del bloque completo, o cadena vacía si no hay cuadre que mostrar. */
export function bloqueCuadreFormaPagoTermico(
  r: CierreConCuadreTermico | null | undefined,
  tipoImpresora?: string,
): string {
  if (!r?.cuadrePorFormaPago?.length) return '';
  const cfg = configTabla(tipoImpresora);
  const sep = '-'.repeat(cfg.ancho);

  const lineas: string[] = [];
  lineas.push(sep);
  lineas.push(...tituloCentrado(`CUADRE POR FORMA DE PAGO${r.cuadreEstimado ? ' (estimado)' : ''}`, cfg.ancho));
  lineas.push(...tablaCuadre(r.cuadrePorFormaPago, cfg));

  for (const s of r.sospechasFormaPago ?? []) {
    lineas.push(sep);
    lineas.push(...tituloCentrado('!! POSIBLE FORMA MAL REGISTRADA', cfg.ancho));
    lineas.push(...lineaLR(LABEL_FORMA[s.formaSobrante] ?? s.formaSobrante, `+${moneyTabla(s.montoSobrante, cfg.comas)}`, cfg.ancho).split('\n'));
    lineas.push(...lineaLR(LABEL_FORMA[s.formaFaltante] ?? s.formaFaltante, moneyTabla(s.montoFaltante, cfg.comas), cfg.ancho).split('\n'));
    if (s.facturasCandidatas?.length) {
      lineas.push(...envolver('Facturas que podrian explicarlo:', cfg.ancho));
      for (const f of s.facturasCandidatas) {
        const desglose = desgloseFormasPago(f.formasPago, cfg.comas);
        lineas.push(...filasItemConMonto(f.folio, desglose || undefined, moneyTabla(Number(f.total), cfg.comas), cfg));
      }
    }
  }

  if (r.cuadreCorregido?.length) {
    lineas.push(sep);
    lineas.push(...tituloCentrado('CUADRE CORREGIDO (tras ajuste de forma de pago)', cfg.ancho));
    lineas.push(...tablaCuadre(r.cuadreCorregido, cfg));
  }

  const sinForma = r.facturasSinFormaPago ?? [];
  if (sinForma.length) {
    lineas.push(sep);
    lineas.push(...tituloCentrado('FACTURAS SIN FORMA DE PAGO', cfg.ancho));
    for (const f of sinForma) {
      lineas.push(...filasItemConMonto(f.folio, f.clienteNombre, moneyTabla(Number(f.total), cfg.comas), cfg));
    }
  }

  // Recierre: el cierre vigente ya se imprimió arriba — el ORIGINAL anulado
  // va en un bloque aparte, con lo que contó/declaró la primera vez y la
  // diferencia contra el conteo actual (requisito explícito 2026-10-10, caso
  // real: Beatriz Riva recerró la caja de Bellamar González y la tarjeta
  // esperada del primer cierre se perdió sin dejar rastro).
  if (r.contadoOriginal != null) {
    lineas.push(sep);
    lineas.push(...tituloCentrado('CIERRE ORIGINAL ANULADO', cfg.ancho));
    const contadoActual = Number(r.saldoFisico ?? 0);
    const contadoOrig   = Number(r.contadoOriginal);
    lineas.push(...lineaLR('Contado original:', moneyTabla(contadoOrig, cfg.comas), cfg.ancho).split('\n'));
    lineas.push(...lineaLR('Contado recierre:', moneyTabla(contadoActual, cfg.comas), cfg.ancho).split('\n'));
    lineas.push(...lineaLR('Diferencia:', difTabla(contadoActual - contadoOrig, cfg.comas), cfg.ancho).split('\n'));
    if (r.cuadrePorFormaPagoOriginal?.length) {
      lineas.push(...tablaCuadre(r.cuadrePorFormaPagoOriginal, cfg));
    }
    if (r.facturasSinFormaPagoOriginal?.length) {
      lineas.push(sep);
      lineas.push(...tituloCentrado('Sin forma de pago (original)', cfg.ancho));
      for (const f of r.facturasSinFormaPagoOriginal) {
        lineas.push(...filasItemConMonto(f.folio, f.clienteNombre, moneyTabla(Number(f.total), cfg.comas), cfg));
      }
    }
  }

  // Red de seguridad final: envolver()/lineaLR() reparten por PALABRAS, así
  // que un solo "token" sin espacios más largo que el ancho (un folio
  // absurdamente largo, por ejemplo) sale tal cual, más ancho que el papel.
  // Aquí se corta a la fuerza, carácter a carácter — ninguna línea, de
  // ningún origen, puede pasar del ancho medido (requisito explícito).
  const lineasSeguras = lineas.flatMap(l => {
    const s = sanear(l);
    if (s.length <= cfg.ancho) return [s];
    const partes: string[] = [];
    for (let i = 0; i < s.length; i += cfg.ancho) partes.push(s.slice(i, i + cfg.ancho));
    return partes;
  });

  const html = lineasSeguras.map(l => `<div class="cf-linea">${escHtml(l)}</div>`).join('');
  return `<div class="cf-bloque">${html}</div>`;
}

/** CSS del bloque. Se inyecta una sola vez en el <style> de la plantilla. */
export const CSS_CUADRE_FORMA_PAGO_TERMICO = `
  /* white-space:pre es obligatorio: sin esto, un navegador real colapsa los
     espacios de relleno de filaTabla()/montoDerecha() a uno solo y las
     columnas se desalinean en pantalla y en el PDF. El conversor ESC/POS
     (htmlAEscPos) no lee CSS, así que esta regla no afecta a la impresión
     Bluetooth — ahí el espaciado ya viene bien desde el texto fuente. */
  .cf-bloque{font-size:8pt;white-space:pre;margin:2px 0}
`;
