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
 * Tamaño de letra (requisito de negocio 2026-10-11, tercera vuelta — la
 * tabla NUNCA debe verse más chica que el resto del ticket, ni con un
 * elemento/clase/función de línea propios): este bloque se renderiza con el
 * MISMO elemento, la MISMA clase CSS y la MISMA función de línea que el
 * resto del cierre (`.row`, exactamente la que ya pinta "Gastos:"/
 * "Retiros:") — nada de `<pre>`, `<table>` ni estilos con un font-size,
 * letter-spacing o line-height propios. Los títulos de sección ("CUADRE POR
 * FORMA DE PAGO", "!! POSIBLE FORMA MAL REGISTRADA"...) usan `.small.bold`,
 * la MISMA clase que ya atenúa "EGRESOS"/"INGRESOS DEL TURNO" en el resto
 * del ticket — no un tamaño inventado para esta tabla.
 *
 * A 58mm/80mm el ancho del papel no alcanza para FORMA + 3 montos en una
 * sola línea de `.row` (que solo admite 2 columnas): el nombre de la forma
 * va en su propio `<div>` y los 3 montos (ESPERADO/CONTADO/DIFER., con su
 * encabezado una sola vez arriba) en un `.row` aparte, alineados a la
 * derecha bajo su columna con relleno de NBSP (un espacio normal se
 * colapsa en HTML; NBSP no, y sanear() —thermalPrinter.ts— ya lo convierte
 * a espacio normal camino a Bluetooth). A carta sobra ancho de sobra para
 * el formato de una sola línea de siempre.
 *
 * Si un monto no entra en su columna ni siquiera sin comas de miles, la fila
 * (y la tabla ENTERA, no solo esa fila — mismo criterio de comas para todas)
 * cae al formato de respaldo: valores que SÍ caben quedan en su línea
 * normal, y solo el que no cupo pasa a una línea aparte con su propia
 * etiqueta ("  Difer.: +1036.74"). El resultado final (RESULTADO: SOBRAN/
 * FALTAN) usa la MISMA decisión de comas que ganó en la tabla.
 */

import { sanear, envolver } from '../services/thermalPrinter';

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

/** Nombres completos — el nombre de la forma siempre tiene su propia línea o espacio de sobra (carta), así que no hace falta una versión corta. */
const LABEL_FORMA: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transfer.', otros: 'Otros',
};

/** Tipo DGII de formasPago (ver cuadre-por-forma-pago.util.ts, backend) → nombre corto para el desglose de una candidata. */
const LABEL_TIPO_DGII: Record<number, string> = {
  1: 'Efectivo', 2: 'Transfer.', 3: 'Tarjeta', 4: 'Crédito', 5: 'Permuta', 6: 'NC',
};

// Espacio irrompible: relleno de columnas sin que el navegador lo colapse a
// uno solo (lo que pasaría con un espacio normal, sin white-space:pre — y
// white-space:pre es justo el "estilo propio" que este rediseño elimina).
// sanear() (thermalPrinter.ts) ya lo convierte a espacio normal camino a
// Bluetooth, así que el canal ESC/POS no se entera de este detalle.
const NBSP = ' ';

const escHtml = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Una línea de texto corrido, con la MISMA sanitización que el resto del ticket. */
function divTexto(texto: string, clase?: string): string {
  return `<div${clase ? ` class="${clase}"` : ''}>${escHtml(sanear(texto))}</div>`;
}

/** Una línea de 2 columnas — EXACTAMENTE `.row`, la misma clase que ya pinta "Gastos:"/"Retiros:" en el resto del ticket. */
function divRow(izq: string, der: string, clase?: string): string {
  return `<div class="row${clase ? ` ${clase}` : ''}"><span>${escHtml(sanear(izq))}</span><span>${escHtml(sanear(der))}</span></div>`;
}

/** Título de sección — `.small.bold`, la misma clase que "EGRESOS"/"INGRESOS DEL TURNO". Envuelto si no entra en una sola línea. */
function tituloSeccion(texto: string, ancho: number): string {
  return envolver(texto, ancho).map(l => divTexto(l, 'small bold')).join('');
}

// ── Configuración de ancho (en caracteres — decide cuándo un monto no entra
// en su columna y hay que caer al formato de respaldo) ─────────────────────

interface ConfigTabla {
  ancho: number;
  comas: boolean;
  /**
   * '2filas': el nombre de la forma en su propio `<div>`, los 3 montos en un
   * `.row` aparte (58mm/80mm — una fila FORMA + 3 montos no cabe en los 2
   * spans de `.row`).
   * 'linea': forma + 3 montos en el mismo `.row` (carta — sobra ancho).
   */
  formato: 'linea' | '2filas';
  wEsp: number; wCon: number; wDif: number;
  gap1: number; gap2: number;
  labels: Record<string, string>;
}

// 58mm: 24 caracteres medidos al tamaño del cuerpo (10pt, Courier New bold).
// wEsp(8) + gap1(1) + wCon(8) + wDif(7) = 24 — gap2 va en 0 a propósito:
// Difer. SIEMPRE lleva un signo ('+'/'-') al frente, así que ese signo, no
// un NBSP, es lo que separa Contado de Difer. cuando Contado llena sus 8
// cifras enteras. Con wDif=7 entran tanto el caso real (+47.00, 6) como un
// descuadre de 3 cifras (+829.94, 7) sin caer al respaldo.
const TABLA_58MM: ConfigTabla = {
  ancho: 24, comas: false, formato: '2filas',
  wEsp: 8, wCon: 8, wDif: 7,
  gap1: 1, gap2: 0,
  labels: LABEL_FORMA,
};

// 80mm / bluetooth / ninguna: 30 caracteres medidos al tamaño del cuerpo
// (11pt) — wEsp(9) + gap1(2) + wCon(9) + gap2(1) + wDif(9) = 30. wDif a 9
// (antes 8) para que un TOTAL de 4 cifras con coma ("+1,036.74", caso real)
// quepa CON coma en vez de tumbar toda la tabla a sin comas; gap1=2 separa
// ESPERADO/CONTADO (ninguno de los dos trae signo propio); gap2=1 porque
// Difer. SIEMPRE lleva '+'/'-' al frente, que ya hace de separador visual.
const TABLA_80MM: ConfigTabla = {
  ancho: 30, comas: true, formato: '2filas',
  wEsp: 9, wCon: 9, wDif: 9,
  gap1: 2, gap2: 1,
  labels: LABEL_FORMA,
};

// Carta (210mm): 41 caracteres medidos al tamaño del cuerpo (12pt) — de
// sobra para separar bien las 3 columnas. Mismo formato '2filas' que
// 58mm/80mm (forma en su línea, montos en la siguiente) — aquí el ancho no
// obliga a usarlo, pero da columnas mucho más legibles que apretarlo todo
// en una sola línea.
const TABLA_CARTA: ConfigTabla = {
  ancho: 41, comas: true, formato: '2filas',
  wEsp: 10, wCon: 10, wDif: 9,
  gap1: 5, gap2: 5,
  labels: LABEL_FORMA,
};

function configTabla(tipoImpresora?: string): ConfigTabla {
  if (tipoImpresora === '58mm' || tipoImpresora === 'bluetooth') return TABLA_58MM;
  if (tipoImpresora === 'carta') return TABLA_CARTA;
  return TABLA_80MM;
}

/** Monto — sin "RD$", con o sin comas de miles según gane la tabla. */
function moneyTabla(v: number, comas: boolean): string {
  const n    = Number(v ?? 0);
  const sign = n < 0 ? '-' : '';
  const abs  = Math.abs(n).toFixed(2);
  if (!comas) return sign + abs;
  const [ent, dec] = abs.split('.');
  return sign + Number(ent).toLocaleString('en-US') + '.' + dec;
}

/** La diferencia SIEMPRE lleva signo — en el formato 'linea' es el separador visual cuando queda pegada a Contado (ver TABLA_CARTA). */
function difTabla(v: number, comas: boolean): string {
  const n = Number(v ?? 0);
  return (n >= 0 ? '+' : '') + moneyTabla(n, comas);
}

/** "Tarjeta 955.00 / Efectivo 125.00" — el desglose real de la factura candidata, lo que explica la sospecha. */
function desgloseFormasPago(fps: { tipo: number; monto: number }[] | undefined, comas: boolean): string {
  if (!fps?.length) return '';
  return fps.map(fp => `${LABEL_TIPO_DGII[fp.tipo] ?? `T${fp.tipo}`} ${moneyTabla(Number(fp.monto), comas)}`).join(' / ');
}

/** Centrado dentro de `w` con NBSP — el sobrante impar queda a la derecha. */
function centrarNBSP(v: string, w: number): string {
  const hueco = w - v.length;
  const izq = Math.floor(hueco / 2);
  return NBSP.repeat(izq) + v + NBSP.repeat(hueco - izq);
}

/**
 * Las 3 columnas con NBSP, o null si algún valor no entra en su ancho.
 * ESPERADO a la izquierda, CONTADO centrado, DIFER. a la derecha — mismo
 * criterio para el encabezado y para cada fila de montos.
 */
function columnas3(cfg: ConfigTabla, esp: string, con: string, dif: string): string | null {
  if (esp.length > cfg.wEsp || con.length > cfg.wCon || dif.length > cfg.wDif) return null;
  return esp.padEnd(cfg.wEsp, NBSP) + NBSP.repeat(cfg.gap1) + centrarNBSP(con, cfg.wCon) + NBSP.repeat(cfg.gap2) + dif.padStart(cfg.wDif, NBSP);
}

/**
 * Igual que columnas3(), pero el valor que no entra queda en blanco (NBSP)
 * en vez de desbordar — para el formato de respaldo, que lo muestra aparte.
 * Misma alineación por columna: ESPERADO izquierda, CONTADO centrado,
 * DIFER. derecha.
 */
function columnas3ConHueco(cfg: ConfigTabla, esp: string, con: string, dif: string): string {
  const izq  = (v: string, w: number) => (v.length <= w ? v.padEnd(w, NBSP) : NBSP.repeat(w));
  const der  = (v: string, w: number) => (v.length <= w ? v.padStart(w, NBSP) : NBSP.repeat(w));
  const cen  = (v: string, w: number) => (v.length <= w ? centrarNBSP(v, w) : NBSP.repeat(w));
  return izq(esp, cfg.wEsp) + NBSP.repeat(cfg.gap1) + cen(con, cfg.wCon) + NBSP.repeat(cfg.gap2) + der(dif, cfg.wDif);
}

/** Una fila ya formateada (3 columnas) en el formato que toque: 'linea' (un solo `.row`) o '2filas' (nombre + `.row` de montos). */
function filaHtml(cfg: ConfigTabla, label: string, montos: string): string {
  if (cfg.formato === 'linea') return divRow(label, montos);
  // '2filas': los montos van en el span IZQUIERDO del .row, no el derecho —
  // así el bloque arranca pegado al margen izquierdo, alineado bajo el
  // nombre de la forma, en vez de empujado hasta el margen derecho con un
  // hueco vacío delante. Cada valor sigue alineado a la derecha DENTRO de
  // su propia columna (columnas3()/columnas3ConHueco() ya lo hacen con
  // padStart).
  return divTexto(label) + divRow(montos, '');
}

/**
 * Formato de respaldo de una fila: lo que SÍ entra queda en su línea normal
 * (en blanco si no entra), y cada valor que no cupo pasa a su propia línea
 * con etiqueta — la fila NUNCA se corta ni se pega a la columna vecina.
 */
function filaHtmlConRespaldo(cfg: ConfigTabla, label: string, esperado: number, contado: number, diferencia: number, comas: boolean): string {
  const fEsp = moneyTabla(esperado, comas);
  const fCon = moneyTabla(contado, comas);
  const fDif = difTabla(diferencia, comas);
  let html = filaHtml(cfg, label, columnas3ConHueco(cfg, fEsp, fCon, fDif));
  if (fEsp.length > cfg.wEsp) html += divRow('  Esperado:', fEsp);
  if (fCon.length > cfg.wCon) html += divRow('  Contado:', fCon);
  if (fDif.length > cfg.wDif) html += divRow('  Difer.:', fDif);
  return html;
}

/**
 * Encabezado + filas (con movimiento o declaración) + TOTAL + leyenda +
 * resultado.
 *
 * Primero intenta la tabla COMPLETA con comas (si el papel las prefiere); si
 * algún valor de cualquier fila —incluido TOTAL— no entra, reintenta la
 * tabla COMPLETA sin comas; si aun así algo no entra, TODA la tabla cae al
 * formato de respaldo — la decisión de comas es una sola para toda la
 * tabla, nunca una fila con comas y otra sin ellas. El RESULTADO final usa
 * esa misma decisión (`comasGanadoras`), no la preferencia original del
 * papel.
 */
function tablaCuadre(todasLasFilas: FilaCuadreTermico[], cfg: ConfigTabla): string {
  const filas = todasLasFilas.filter(f =>
    // Sin movimiento esperado ni declarado: no aporta nada a la tabla.
    Math.abs(f.esperado) >= 0.005 || Math.abs(f.declarado) >= 0.005 || Math.abs(f.diferencia) >= 0.005,
  );
  let sEsp = 0, sCon = 0, sDif = 0;
  for (const f of filas) { sEsp += Number(f.esperado || 0); sCon += Number(f.declarado || 0); sDif += Number(f.diferencia || 0); }

  let tablaHtml: string | null = null;
  let comasGanadoras = cfg.comas;
  for (const comas of (cfg.comas ? [true, false] : [false])) {
    const header = columnas3(cfg, 'ESPERADO', 'CONTADO', 'DIFER.');
    if (header == null) continue;
    const partes: string[] = [cfg.formato === 'linea' ? divRow('', header) : divRow(header, '')];
    let ok = true;
    for (const f of filas) {
      const montos = columnas3(cfg, moneyTabla(f.esperado, comas), moneyTabla(f.declarado, comas), difTabla(f.diferencia, comas));
      if (montos == null) { ok = false; break; }
      partes.push(filaHtml(cfg, cfg.labels[f.forma] ?? f.forma, montos));
    }
    if (ok) {
      const totalMontos = columnas3(cfg, moneyTabla(sEsp, comas), moneyTabla(sCon, comas), difTabla(sDif, comas));
      if (totalMontos != null) {
        partes.push(filaHtml(cfg, 'TOTAL', totalMontos));
        tablaHtml = partes.join('');
        comasGanadoras = comas;
        break;
      }
    }
  }

  if (tablaHtml == null) {
    comasGanadoras = cfg.comas;
    const headerHueco = columnas3ConHueco(cfg, 'ESPERADO', 'CONTADO', 'DIFER.');
    tablaHtml = cfg.formato === 'linea' ? divRow('', headerHueco) : divRow(headerHueco, '');
    for (const f of filas) tablaHtml += filaHtmlConRespaldo(cfg, cfg.labels[f.forma] ?? f.forma, f.esperado, f.declarado, f.diferencia, comasGanadoras);
    tablaHtml += filaHtmlConRespaldo(cfg, 'TOTAL', sEsp, sCon, sDif, comasGanadoras);
  }

  const esCuadrado = Math.abs(sDif) < 0.005;
  const esSobrante = sDif > 0;
  const resultado = esCuadrado ? 'RESULTADO: CUADRA'
    : esSobrante ? `RESULTADO: SOBRAN RD$${moneyTabla(Math.abs(sDif), comasGanadoras)}`
    :              `RESULTADO: FALTAN RD$${moneyTabla(Math.abs(sDif), comasGanadoras)}`;

  const leyenda = [...envolver('(+) sobra   (-) falta', cfg.ancho), ...envolver(resultado, cfg.ancho)]
    .map(l => divTexto(l)).join('');
  return tablaHtml + leyenda;
}

/** Devuelve el HTML del bloque completo, o cadena vacía si no hay cuadre que mostrar. */
export function bloqueCuadreFormaPagoTermico(
  r: CierreConCuadreTermico | null | undefined,
  tipoImpresora?: string,
): string {
  if (!r?.cuadrePorFormaPago?.length) return '';
  const cfg = configTabla(tipoImpresora);
  const sep = '<div class="sep">--------------------------------</div>';

  let html = '';
  html += sep;
  html += tituloSeccion(`CUADRE POR FORMA DE PAGO${r.cuadreEstimado ? ' (estimado)' : ''}`, cfg.ancho);
  html += tablaCuadre(r.cuadrePorFormaPago, cfg);

  for (const s of r.sospechasFormaPago ?? []) {
    html += sep;
    html += tituloSeccion('!! POSIBLE FORMA MAL REGISTRADA', cfg.ancho);
    html += divRow(LABEL_FORMA[s.formaSobrante] ?? s.formaSobrante, `+${moneyTabla(s.montoSobrante, cfg.comas)}`);
    html += divRow(LABEL_FORMA[s.formaFaltante] ?? s.formaFaltante, moneyTabla(s.montoFaltante, cfg.comas));
    if (s.facturasCandidatas?.length) {
      html += envolver('Facturas que podrian explicarlo:', cfg.ancho).map(l => divTexto(l)).join('');
      for (const f of s.facturasCandidatas) {
        const desglose = desgloseFormasPago(f.formasPago, cfg.comas);
        html += envolver(f.folio, cfg.ancho).map(l => divTexto(l)).join('');
        if (desglose) html += envolver(desglose, cfg.ancho).map(l => divTexto(l)).join('');
        html += divRow('', moneyTabla(Number(f.total), cfg.comas));
      }
    }
  }

  if (r.cuadreCorregido?.length) {
    html += sep;
    html += tituloSeccion('CUADRE CORREGIDO (tras ajuste de forma de pago)', cfg.ancho);
    html += tablaCuadre(r.cuadreCorregido, cfg);
  }

  const sinForma = r.facturasSinFormaPago ?? [];
  if (sinForma.length) {
    html += sep;
    html += tituloSeccion('FACTURAS SIN FORMA DE PAGO', cfg.ancho);
    for (const f of sinForma) {
      html += envolver(f.folio, cfg.ancho).map(l => divTexto(l)).join('');
      if (f.clienteNombre) html += divRow('', f.clienteNombre);
      html += divRow('', moneyTabla(Number(f.total), cfg.comas));
    }
  }

  // Recierre: el cierre vigente ya se imprimió arriba — el ORIGINAL anulado
  // va en un bloque aparte, con lo que contó/declaró la primera vez y la
  // diferencia contra el conteo vigente (requisito explícito 2026-10-10, caso
  // real: Beatriz Riva recerró la caja de Bellamar González y la tarjeta
  // esperada del primer cierre se perdió sin dejar rastro).
  if (r.contadoOriginal != null) {
    html += sep;
    html += tituloSeccion('CIERRE ORIGINAL ANULADO', cfg.ancho);
    const contadoActual = Number(r.saldoFisico ?? 0);
    const contadoOrig   = Number(r.contadoOriginal);
    html += divRow('Contado original:', moneyTabla(contadoOrig, cfg.comas));
    html += divRow('Contado recierre:', moneyTabla(contadoActual, cfg.comas));
    html += divRow('Diferencia:', difTabla(contadoActual - contadoOrig, cfg.comas));
    if (r.cuadrePorFormaPagoOriginal?.length) {
      html += tablaCuadre(r.cuadrePorFormaPagoOriginal, cfg);
    }
    if (r.facturasSinFormaPagoOriginal?.length) {
      html += sep;
      html += tituloSeccion('Sin forma de pago (original)', cfg.ancho);
      for (const f of r.facturasSinFormaPagoOriginal) {
        html += envolver(f.folio, cfg.ancho).map(l => divTexto(l)).join('');
        if (f.clienteNombre) html += divRow('', f.clienteNombre);
        html += divRow('', moneyTabla(Number(f.total), cfg.comas));
      }
    }
  }

  return html;
}
