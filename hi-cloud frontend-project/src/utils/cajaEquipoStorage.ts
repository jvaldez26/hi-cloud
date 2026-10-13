/**
 * "Hay una caja abierta de [cajero] en este equipo" — aviso al iniciar
 * sesión (incidente real, empresa 73, caja #788 y #762/#767: un cajero deja
 * su caja abierta, cierra sesión o se desplaza, y otro usuario entra en el
 * MISMO equipo sin saber que ya hay un turno abierto ahí).
 *
 * Clave por EQUIPO (no por usuario, no por sesión): tiene que sobrevivir el
 * cambio de usuario para poder avisarle AL SIGUIENTE que entra. Se guarda al
 * abrir caja desde este navegador y se borra al cerrarla desde aquí mismo —
 * si se cerró desde OTRO equipo (ej. un admin que la cierra desde el panel
 * de Caja en otra sesión), la clave puede quedar apuntando a una caja ya
 * cerrada; por eso el aviso siempre reverifica contra el backend antes de
 * mostrarse (ver verificarYAvisarCajaAbierta en auth.store.ts) — esta clave
 * es solo la pista de "qué mirar", nunca la fuente de verdad.
 */

const CLAVE = 'hc_caja_abierta_equipo';

export interface CajaAbiertaEquipo {
  cajaId:         number;
  vendedorId:     number;
  vendedorNombre: string;
}

export function registrarCajaAbiertaEquipo(info: CajaAbiertaEquipo): void {
  try { localStorage.setItem(CLAVE, JSON.stringify(info)); } catch { /* storage inaccesible — no crítico */ }
}

/** Solo borra si la caja que se cerró es la que estaba registrada — una caja distinta no debe pisar el registro de otra. */
export function limpiarCajaAbiertaEquipoSiEs(cajaId: number): void {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return;
    const actual = JSON.parse(raw) as CajaAbiertaEquipo;
    if (actual?.cajaId === cajaId) localStorage.removeItem(CLAVE);
  } catch { try { localStorage.removeItem(CLAVE); } catch { /* no-op */ } }
}

export function leerCajaAbiertaEquipo(): CajaAbiertaEquipo | null {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    return JSON.parse(raw) as CajaAbiertaEquipo;
  } catch { return null; }
}
