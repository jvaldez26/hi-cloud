/**
 * Persistencia del carrito y de las ventas en espera del POS — con clave
 * por empresa + usuario + sucursal.
 *
 * Antes la clave era fija ('pos-carrito-activo' / 'pos-ventas-espera'),
 * compartida por CUALQUIER cajero de la empresa en esa PC: si el cajero A
 * cerraba sesión sin cobrar (voluntario o no) y el cajero B entraba después
 * en la misma máquina, B veía el carrito de A. Con la clave por usuario,
 * cada cajero solo puede leer/escribir la suya — no hace falta acordarse de
 * borrar nada al cambiar de usuario, el aislamiento es estructural.
 */

export interface CarritoPersistido<T> {
  empresaId: number;
  items:     T[];
}

const CLAVE_VIEJA_CARRITO = 'pos-carrito-activo';
const CLAVE_VIEJA_ESPERA  = 'pos-ventas-espera';

function sufijo(empresaId: number, userId: number, sucursalId: number | null): string {
  return `${empresaId}:${userId}:${sucursalId ?? '_'}`;
}

export function claveCarrito(empresaId: number, userId: number, sucursalId: number | null): string {
  return `${CLAVE_VIEJA_CARRITO}:${sufijo(empresaId, userId, sucursalId)}`;
}

export function claveVentasEspera(empresaId: number, userId: number, sucursalId: number | null): string {
  return `${CLAVE_VIEJA_ESPERA}:${sufijo(empresaId, userId, sucursalId)}`;
}

/**
 * Lee la clave nueva (por usuario). Si no existe pero SÍ existe la clave
 * vieja (compartida, sin usuario) y su empresaId coincide con la actual, la
 * migra — una sola vez — a la clave nueva de ESTE usuario y borra la vieja.
 * Sin esto, los carritos que los cajeros ya tienen abiertos hoy
 * desaparecerían con el despliegue en vez de recuperarse.
 *
 * `recuperado` distingue una migración real (había algo en la clave vieja)
 * de una lectura normal — SoportePage… digo, POSPage lo usa para decidir si
 * muestra el aviso "Se recuperó tu carrito".
 */
function leerConMigracion<T>(
  claveNueva: string,
  claveVieja: string,
  empresaId: number,
): { items: T[]; recuperado: boolean } {
  try {
    const guardadoNuevo = localStorage.getItem(claveNueva);
    if (guardadoNuevo) {
      const data = JSON.parse(guardadoNuevo);
      const items = Array.isArray(data?.items) ? data.items : [];
      return { items, recuperado: items.length > 0 };
    }
  } catch { /* clave nueva corrupta — se trata como ausente, cae a la migración */ }

  try {
    const guardadoViejo = localStorage.getItem(claveVieja);
    if (!guardadoViejo) return { items: [], recuperado: false };

    const data = JSON.parse(guardadoViejo);
    localStorage.removeItem(claveVieja); // se consume la clave vieja siempre, exista o no coincidencia

    if (Array.isArray(data)) return { items: [], recuperado: false }; // formato legado (aún más viejo, sin empresaId)
    if (String(data.empresaId) !== String(empresaId)) return { items: [], recuperado: false }; // no migrar entre empresas

    const items: T[] = Array.isArray(data.items) ? data.items : [];
    if (items.length > 0) {
      localStorage.setItem(claveNueva, JSON.stringify({ empresaId, items }));
    }
    return { items, recuperado: items.length > 0 };
  } catch {
    return { items: [], recuperado: false };
  }
}

export function leerCarritoGuardado<T>(
  empresaId: number, userId: number, sucursalId: number | null,
): { items: T[]; recuperado: boolean } {
  return leerConMigracion<T>(claveCarrito(empresaId, userId, sucursalId), CLAVE_VIEJA_CARRITO, empresaId);
}

export function leerVentasEsperaGuardadas<T>(
  empresaId: number, userId: number, sucursalId: number | null,
): { items: T[]; recuperado: boolean } {
  return leerConMigracion<T>(claveVentasEspera(empresaId, userId, sucursalId), CLAVE_VIEJA_ESPERA, empresaId);
}

export function guardarCarrito<T>(
  empresaId: number, userId: number, sucursalId: number | null, items: T[],
): void {
  localStorage.setItem(claveCarrito(empresaId, userId, sucursalId), JSON.stringify({ empresaId, items }));
}

export function guardarVentasEspera<T>(
  empresaId: number, userId: number, sucursalId: number | null, items: T[],
): void {
  localStorage.setItem(claveVentasEspera(empresaId, userId, sucursalId), JSON.stringify({ empresaId, items }));
}

/** Solo para logout VOLUNTARIO — un cierre involuntario (expired/displaced/caducada) nunca llama esto. */
export function borrarCarritoYEspera(
  empresaId: number | null | undefined, userId: number | null | undefined, sucursalId: number | null,
): void {
  if (empresaId == null || userId == null) return;
  localStorage.removeItem(claveCarrito(empresaId, userId, sucursalId));
  localStorage.removeItem(claveVentasEspera(empresaId, userId, sucursalId));
}
