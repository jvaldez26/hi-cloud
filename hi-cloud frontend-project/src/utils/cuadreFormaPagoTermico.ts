/**
 * Bloque "CUADRE POR FORMA DE PAGO" del ticket térmico del cierre de caja.
 *
 * Igual que bloqueFacturasTermico (cierreFacturasTermico.ts): vive aquí y no
 * dentro de cada pantalla porque hay varias plantillas que imprimen el mismo
 * cierre — el recibo inmediato del POS al cerrar (POSPage.tsx) y las dos del
 * panel de Caja (CajaPage.tsx: ticket simple y ticket con detalle) — y deben
 * salir idénticas. Bug real (2026-10-10): el cuadre por forma de pago se
 * agregó al Drawer en pantalla pero NUNCA a estas tres plantillas de
 * impresión, así que reimprimir cualquier cierre (viejo o recién cerrado)
 * seguía mostrando el formato de solo-efectivo.
 *
 * Los datos vienen del cierre tal cual lo devuelve el backend
 * (`cuadrePorFormaPago`/`sospechasFormaPago`/`facturasSinFormaPago`/
 * `cuadreCorregido`, ver cuadre-por-forma-pago.util.ts y caja.service.ts) —
 * aquí no se calcula ningún monto, solo se formatea.
 *
 * Formato de 2 columnas (izquierda/derecha) en TODAS las filas, nunca más —
 * el conversor a ESC/POS de thermalPrinter.ts (impresión Bluetooth, ver
 * htmlAEscPos/proc()) solo lee los dos primeros <span> de una fila ".row" y
 * descarta el resto en silencio; una fila con 4 columnas perdía declarado y
 * diferencia en el ticket Bluetooth sin que nadie lo notara en pantalla.
 * Cada forma ocupa 3 líneas (esperado/declarado/diferencia) en vez de una
 * fila ancha — más texto, pero nunca pierde un dato.
 *
 * Sin caracteres especiales (⚠ etc.) — muchas impresoras ESC/POS (código de
 * página ASCII/CP437/Latin) no los tienen y los imprimen como "?" o los
 * omiten; se usa texto plano ("!!").
 */

export interface FilaCuadreTermico {
  forma:      string;
  esperado:   number;
  declarado:  number;
  diferencia: number;
}

export interface CierreConCuadreTermico {
  cuadrePorFormaPago?:  FilaCuadreTermico[];
  cuadreCorregido?:     FilaCuadreTermico[];
  cuadreEstimado?:      boolean;
  sospechasFormaPago?: {
    formaSobrante: string; formaFaltante: string;
    montoSobrante: number; montoFaltante: number;
    facturasCandidatas?: { id: number; folio: string; total: number; formasPago?: { tipo: number; monto: number }[] }[];
  }[];
  facturasSinFormaPago?: { id: number; folio: string; total: number; clienteNombre?: string }[];
}

const LABEL_FORMA: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transfer.', otros: 'Otros',
};

/** Tipo DGII de formasPago (ver cuadre-por-forma-pago.util.ts, backend) → nombre corto para el desglose de una candidata. */
const LABEL_TIPO_DGII: Record<number, string> = {
  1: 'Efectivo', 2: 'Transfer.', 3: 'Tarjeta', 4: 'Crédito', 5: 'Permuta', 6: 'NC',
};

/** "Tarjeta 955.00 / Efectivo 125.00" — el desglose real de la factura candidata, lo que explica la sospecha. */
function desgloseFormasPago(fps: { tipo: number; monto: number }[] | undefined): string {
  if (!fps?.length) return '';
  return fps.map(fp => `${LABEL_TIPO_DGII[fp.tipo] ?? `T${fp.tipo}`} ${money(Number(fp.monto))}`).join(' / ');
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const money = (v: number) =>
  Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Una fila de 2 columnas — izquierda/derecha, el único formato que el conversor BT lee completo. */
const fila = (izq: string, der: string, clase = '') =>
  `<div class="cf-row${clase ? ' ' + clase : ''}"><span class="cf-izq">${esc(izq)}</span><span class="cf-der">${esc(der)}</span></div>`;

function tabla(filas: FilaCuadreTermico[]): string {
  const cuerpo = filas.map(f => {
    const dif = `${f.diferencia > 0 ? '+' : ''}${money(f.diferencia)}`;
    return (
      fila(LABEL_FORMA[f.forma] ?? f.forma, money(f.esperado), 'cf-bold') +
      fila('  Declarado', money(f.declarado)) +
      fila('  Diferencia', dif, Math.abs(f.diferencia) > 0.01 ? 'cf-bold' : '')
    );
  }).join('');

  const neto = filas.reduce((s, f) => s + Number(f.diferencia || 0), 0);
  const netoTxt = `${neto > 0 ? '+' : ''}${money(neto)}`;

  return cuerpo + fila('NETO', netoTxt, 'cf-bold cf-neto');
}

/** Devuelve el HTML del bloque completo, o cadena vacía si no hay cuadre que mostrar. */
export function bloqueCuadreFormaPagoTermico(r: CierreConCuadreTermico | null | undefined): string {
  if (!r?.cuadrePorFormaPago?.length) return '';

  const sospechas = r.sospechasFormaPago ?? [];
  const sinForma  = r.facturasSinFormaPago ?? [];

  const bloqueSospechas = sospechas.map(s => {
    const candidatas = s.facturasCandidatas?.length
      ? `<div class="cf-candidatas-titulo">Facturas que podrían explicarlo:</div>` +
        s.facturasCandidatas.map(f => {
          const desglose = desgloseFormasPago(f.formasPago);
          return fila(f.folio, desglose || money(Number(f.total)));
        }).join('')
      : '';
    return (
      `<div class="sep">--------------------------------</div>` +
      `<div class="cf-aviso">!! POSIBLE FORMA MAL REGISTRADA</div>` +
      fila(LABEL_FORMA[s.formaSobrante] ?? s.formaSobrante, `+${money(s.montoSobrante)}`) +
      fila(LABEL_FORMA[s.formaFaltante] ?? s.formaFaltante, money(s.montoFaltante)) +
      candidatas
    );
  }).join('');

  const bloqueCorregido = r.cuadreCorregido?.length
    ? `<div class="sep">--------------------------------</div>` +
      `<div class="cf-titulo">CUADRE CORREGIDO (tras ajuste de forma de pago)</div>` +
      tabla(r.cuadreCorregido)
    : '';

  const bloqueSinForma = sinForma.length
    ? `<div class="sep">--------------------------------</div>` +
      `<div class="cf-titulo cf-rojo">FACTURAS SIN FORMA DE PAGO</div>` +
      sinForma.map(f => fila(
        f.clienteNombre ? `${f.folio} · ${f.clienteNombre}` : f.folio,
        money(f.total),
        'cf-rojo',
      )).join('')
    : '';

  return (
    `<div class="sep">--------------------------------</div>` +
    `<div class="cf-titulo">CUADRE POR FORMA DE PAGO${r.cuadreEstimado ? ' (estimado)' : ''}</div>` +
    tabla(r.cuadrePorFormaPago) +
    bloqueSospechas +
    bloqueCorregido +
    bloqueSinForma
  );
}

/** CSS del bloque. Se inyecta una sola vez en el <style> de la plantilla. */
export const CSS_CUADRE_FORMA_PAGO_TERMICO = `
  .cf-titulo{font-weight:700;text-align:center;margin:3px 0 2px}
  .cf-row{display:flex;justify-content:space-between;gap:4px;font-size:.8em}
  .cf-row.cf-bold{font-weight:700}
  .cf-row.cf-neto{border-top:1px solid #000;margin-top:2px;padding-top:2px}
  .cf-izq{flex:0 0 auto}
  .cf-der{flex:1 1 auto;text-align:right;font-variant-numeric:tabular-nums}
  .cf-aviso{font-weight:700;text-align:center;font-size:.85em}
  .cf-candidatas-titulo{font-size:.75em;font-weight:700;margin-top:3px}
  .cf-rojo{color:#c00!important}
`;
