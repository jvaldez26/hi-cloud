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
 * Tamaño de letra (requisito de negocio 2026-10-11): la tabla NUNCA debe
 * verse más chica que el resto del ticket, ni con un elemento/clase/función
 * de línea propios. El título de cada sección ("CUADRE POR FORMA DE PAGO",
 * "!! POSIBLE FORMA MAL REGISTRADA"...) usa `.small.bold`, la MISMA clase
 * que ya atenúa "EGRESOS"/"INGRESOS DEL TURNO" en el resto del ticket.
 *
 * Alineación de columnas (requisito 2026-10-12, cuarta vuelta): un primer
 * intento rellenó cada columna con NBSP dentro de un único `<span>` de
 * `.row` — pero `sanear()` (thermalPrinter.ts, aplicado a TODO dato del
 * ticket, no solo al camino Bluetooth) convierte NBSP a espacio normal
 * ANTES de llegar al HTML, y el navegador colapsa esos espacios: la
 * alineación por caracteres quedaba rota en la impresión real aunque se
 * viera bien en una vista previa que no pasara por sanear(). Solución: cada
 * fila de montos es `.row3` — 3 `<span>` de ancho igual (flex:1, el papel
 * se reparte entre los tres, funciona igual a 58mm y a 80mm) con
 * `text-align` fijo por posición (ESPERADO izquierda, CONTADO centro,
 * DIFER. derecha, la misma alineación que ya usan los montos de
 * "Gastos:"/"Retiros:"/el desglose de billetes). `.row3` es puro layout
 * (display/flex/text-align) — no declara font-size/letter-spacing/
 * line-height, así que sigue heredando el tamaño del cuerpo del ticket.
 *
 * El nombre de la forma (Efectivo, Tarjeta, TOTAL) sigue en su propio
 * `<div>`, a la izquierda, arriba de su fila de montos — un `.row` de 2
 * columnas no tiene espacio para FORMA + 3 montos a la vez.
 *
 * `wEsp`/`wCon`/`wDif` ya no rellenan nada — solo deciden si un valor entra
 * en su columna o si hay que caer al formato de respaldo (ver más abajo),
 * usando el ancho en caracteres medido para cada papel.
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

/**
 * Una línea de 3 columnas de ancho igual — `.row3`: ESPERADO a la
 * izquierda, CONTADO centrado, DIFER. a la derecha, por `text-align` CSS
 * (nunca por relleno de caracteres, que sanear() rompe — ver cabecera del
 * archivo). Puro layout: no declara font-size/letter-spacing/line-height.
 */
function divRow3(esp: string, con: string, dif: string): string {
  return `<div class="row3"><span>${escHtml(sanear(esp))}</span><span>${escHtml(sanear(con))}</span><span>${escHtml(sanear(dif))}</span></div>`;
}

/** Título de sección — `.small.bold`, la misma clase que "EGRESOS"/"INGRESOS DEL TURNO". Envuelto si no entra en una sola línea. */
function tituloSeccion(texto: string, ancho: number): string {
  return envolver(texto, ancho).map(l => divTexto(l, 'small bold')).join('');
}

// ── Configuración de ancho (en caracteres — decide cuándo un monto no entra
// en su columna y hay que caer al formato de respaldo; ya NO rellena nada,
// la alineación la da `.row3` por CSS) ──────────────────────────────────────

interface ConfigTabla {
  ancho: number;
  comas: boolean;
  wEsp: number; wCon: number; wDif: number;
  labels: Record<string, string>;
}

// 58mm: 24 caracteres medidos al tamaño del cuerpo (10pt, Courier New bold).
// Con wDif=7 entran tanto el caso real (+47.00, 6) como un descuadre de 3
// cifras (+829.94, 7) sin caer al respaldo.
const TABLA_58MM: ConfigTabla = {
  ancho: 24, comas: false,
  wEsp: 8, wCon: 8, wDif: 7,
  labels: LABEL_FORMA,
};

// 80mm / bluetooth / ninguna: 30 caracteres medidos al tamaño del cuerpo
// (11pt). wDif a 9 para que un TOTAL de 4 cifras con coma ("+1,036.74",
// caso real) quepa CON coma en vez de tumbar toda la tabla a sin comas.
const TABLA_80MM: ConfigTabla = {
  ancho: 30, comas: true,
  wEsp: 9, wCon: 9, wDif: 9,
  labels: LABEL_FORMA,
};

// Carta (210mm): 41 caracteres medidos al tamaño del cuerpo (12pt) — de
// sobra para las 3 columnas.
const TABLA_CARTA: ConfigTabla = {
  ancho: 41, comas: true,
  wEsp: 10, wCon: 10, wDif: 9,
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

/** La diferencia SIEMPRE lleva signo — "+"/"-" al frente. */
function difTabla(v: number, comas: boolean): string {
  const n = Number(v ?? 0);
  return (n >= 0 ? '+' : '') + moneyTabla(n, comas);
}

/** "Tarjeta 955.00 / Efectivo 125.00" — el desglose real de la factura candidata, lo que explica la sospecha. */
function desgloseFormasPago(fps: { tipo: number; monto: number }[] | undefined, comas: boolean): string {
  if (!fps?.length) return '';
  return fps.map(fp => `${LABEL_TIPO_DGII[fp.tipo] ?? `T${fp.tipo}`} ${moneyTabla(Number(fp.monto), comas)}`).join(' / ');
}

/** ¿Caben los 3 valores en su columna? Si alguno no cabe, la fila (o la tabla entera) cae al formato de respaldo. */
function cabenColumnas(cfg: ConfigTabla, esp: string, con: string, dif: string): boolean {
  return esp.length <= cfg.wEsp && con.length <= cfg.wCon && dif.length <= cfg.wDif;
}

/** Una fila de montos: el nombre de la forma en su propio `<div>` (izquierda), los 3 valores en un `.row3` aparte. */
function filaHtml(label: string, esp: string, con: string, dif: string): string {
  return divTexto(label) + divRow3(esp, con, dif);
}

/**
 * Formato de respaldo de una fila: el valor que no cabe en su columna se
 * deja en blanco en la línea de `.row3` y pasa a su propia línea con
 * etiqueta — la fila NUNCA se corta ni se pega a la columna vecina.
 */
function filaHtmlConRespaldo(cfg: ConfigTabla, label: string, esperado: number, contado: number, diferencia: number, comas: boolean): string {
  const fEsp = moneyTabla(esperado, comas);
  const fCon = moneyTabla(contado, comas);
  const fDif = difTabla(diferencia, comas);
  let html = filaHtml(
    label,
    fEsp.length <= cfg.wEsp ? fEsp : '',
    fCon.length <= cfg.wCon ? fCon : '',
    fDif.length <= cfg.wDif ? fDif : '',
  );
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
    const partes: string[] = [divRow3('ESPERADO', 'CONTADO', 'DIFER.')];
    let ok = true;
    for (const f of filas) {
      const fEsp = moneyTabla(f.esperado, comas), fCon = moneyTabla(f.declarado, comas), fDif = difTabla(f.diferencia, comas);
      if (!cabenColumnas(cfg, fEsp, fCon, fDif)) { ok = false; break; }
      partes.push(filaHtml(cfg.labels[f.forma] ?? f.forma, fEsp, fCon, fDif));
    }
    if (ok) {
      const tEsp = moneyTabla(sEsp, comas), tCon = moneyTabla(sCon, comas), tDif = difTabla(sDif, comas);
      if (cabenColumnas(cfg, tEsp, tCon, tDif)) {
        partes.push(filaHtml('TOTAL', tEsp, tCon, tDif));
        tablaHtml = partes.join('');
        comasGanadoras = comas;
        break;
      }
    }
  }

  if (tablaHtml == null) {
    comasGanadoras = cfg.comas;
    tablaHtml = divRow3('ESPERADO', 'CONTADO', 'DIFER.');
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
