/**
 * Puente entre el botón "Cobrar" del tablero de Car Wash y el POS normal —
 * el POS lee esta clave UNA vez al montar, construye el carrito y la
 * limpia enseguida. No reemplaza la facturación del POS: solo le entrega
 * los datos para que el cajero cobre como siempre (ver facturas.service.ts,
 * FacturasController — Factura.origenTipo/origenId).
 */

const CLAVE = 'cw_pos_origen_v1';

export interface ItemOrigenCw {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  porcentajeIva?: number;
}

export interface OrigenPendienteCw {
  empresaId: number;
  origenTipo: 'car_wash_turno';
  origenId: number;
  clienteId?: number;
  items: ItemOrigenCw[];
}

export function guardarOrigenPendiente(data: OrigenPendienteCw): void {
  try { localStorage.setItem(CLAVE, JSON.stringify(data)); } catch { /* localStorage no disponible */ }
}

export function leerOrigenPendiente(empresaId: number): OrigenPendienteCw | null {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    const data = JSON.parse(raw) as OrigenPendienteCw;
    if (data.empresaId !== empresaId) return null;
    return data;
  } catch {
    return null;
  }
}

export function limpiarOrigenPendiente(): void {
  try { localStorage.removeItem(CLAVE); } catch { /* noop */ }
}
