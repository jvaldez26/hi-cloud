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
  sospechasFormaPago?:  { formaSobrante: string; formaFaltante: string; monto: number }[];
  facturasSinFormaPago?: { id: number; folio: string; total: number; clienteNombre?: string }[];
}

const LABEL_FORMA: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transfer.', otros: 'Otros',
};

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const money = (v: number) =>
  Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function tabla(filas: FilaCuadreTermico[]): string {
  const filasHtml = filas.map(f => `
    <div class="cf-row">
      <span class="cf-forma">${esc(LABEL_FORMA[f.forma] ?? f.forma)}</span>
      <span class="cf-num">${esc(money(f.esperado))}</span>
      <span class="cf-num">${esc(money(f.declarado))}</span>
      <span class="cf-num cf-dif" style="${f.diferencia > 0.01 ? 'font-weight:700' : f.diferencia < -0.01 ? 'font-weight:700' : ''}">
        ${f.diferencia > 0 ? '+' : ''}${esc(money(f.diferencia))}
      </span>
    </div>
  `).join('');

  const neto = filas.reduce((s, f) => s + Number(f.diferencia || 0), 0);

  return `
    <div class="cf-cab">
      <span class="cf-forma">FORMA</span>
      <span class="cf-num">ESPER.</span>
      <span class="cf-num">DECL.</span>
      <span class="cf-num">DIF.</span>
    </div>
    ${filasHtml}
    <div class="cf-row cf-bold">
      <span class="cf-forma">NETO</span>
      <span class="cf-num"></span>
      <span class="cf-num"></span>
      <span class="cf-num">${neto > 0 ? '+' : ''}${esc(money(neto))}</span>
    </div>
  `;
}

/** Devuelve el HTML del bloque completo, o cadena vacía si no hay cuadre que mostrar. */
export function bloqueCuadreFormaPagoTermico(r: CierreConCuadreTermico | null | undefined): string {
  if (!r?.cuadrePorFormaPago?.length) return '';

  const sospechas = r.sospechasFormaPago ?? [];
  const sinForma  = r.facturasSinFormaPago ?? [];

  return `
    <div class="sep">--------------------------------</div>
    <div class="cf-titulo">CUADRE POR FORMA DE PAGO${r.cuadreEstimado ? ' (estimado)' : ''}</div>
    ${tabla(r.cuadrePorFormaPago)}
    ${sospechas.map(s => `
      <div class="sep">--------------------------------</div>
      <div class="cf-aviso">⚠ POSIBLE FORMA MAL REGISTRADA</div>
      <div class="cf-aviso-detalle">
        ${esc(LABEL_FORMA[s.formaSobrante] ?? s.formaSobrante)} +${esc(money(s.monto))} /
        ${esc(LABEL_FORMA[s.formaFaltante] ?? s.formaFaltante)} ${esc(money(-s.monto))}
      </div>
    `).join('')}
    ${r.cuadreCorregido?.length ? `
      <div class="sep">--------------------------------</div>
      <div class="cf-titulo">CUADRE CORREGIDO (tras ajuste de forma de pago)</div>
      ${tabla(r.cuadreCorregido)}
    ` : ''}
    ${sinForma.length ? `
      <div class="sep">--------------------------------</div>
      <div class="cf-titulo cf-rojo">FACTURAS SIN FORMA DE PAGO</div>
      ${sinForma.map(f => `
        <div class="cf-row cf-rojo">
          <span class="cf-forma">${esc(f.folio)}${f.clienteNombre ? ` · ${esc(f.clienteNombre)}` : ''}</span>
          <span class="cf-num"></span><span class="cf-num"></span>
          <span class="cf-num">${esc(money(f.total))}</span>
        </div>
      `).join('')}
    ` : ''}
  `;
}

/** CSS del bloque. Se inyecta una sola vez en el <style> de la plantilla. */
export const CSS_CUADRE_FORMA_PAGO_TERMICO = `
  .cf-titulo{font-weight:700;text-align:center;margin:3px 0 2px}
  .cf-cab{display:flex;font-size:.72em;font-weight:700;border-bottom:1px solid #000;padding-bottom:1px}
  .cf-row{display:flex;font-size:.8em;padding:1px 0}
  .cf-row.cf-bold{font-weight:700;border-top:1px solid #000;margin-top:2px;padding-top:2px}
  .cf-forma{flex:0 0 34%;overflow:hidden;white-space:nowrap}
  .cf-num{flex:1 1 22%;text-align:right;font-variant-numeric:tabular-nums}
  .cf-aviso{font-weight:700;text-align:center;font-size:.85em}
  .cf-aviso-detalle{text-align:center;font-size:.78em}
  .cf-rojo{color:#c00!important}
`;
