/**
 * Persistencia del carrito y de las ventas en espera del POS — con clave
 * por empresa + usuario + sucursal + PESTAÑA.
 *
 * Antes la clave era fija ('pos-carrito-activo' / 'pos-ventas-espera'),
 * compartida por CUALQUIER cajero de la empresa en esa PC: si el cajero A
 * cerraba sesión sin cobrar (voluntario o no) y el cajero B entraba después
 * en la misma máquina, B veía el carrito de A. Con la clave por usuario se
 * cerró eso — pero localStorage se comparte entre TODAS las pestañas del
 * mismo origen, así que dos pestañas del mismo cajero seguían leyendo y
 * escribiendo exactamente la misma clave: podían cobrar el mismo carrito
 * dos veces. Decisión (2026-10-08): varias pestañas del POS a la vez es un
 * flujo válido, así que cada pestaña necesita SU PROPIO carrito.
 *
 * `idDePestana()` resuelve eso con una propiedad nativa del navegador:
 * sessionStorage sobrevive a un F5/recarga de ESTA pestaña, pero una
 * pestaña nueva (o duplicada) nunca lo hereda — no comparte sessionStorage
 * con ninguna otra, ni siquiera del mismo origen. Ese id entra en la clave
 * de carrito, así que dos pestañas del mismo cajero ya no chocan nunca.
 *
 * El carrito de una pestaña sigue viviendo en localStorage (no
 * sessionStorage) para poder ofrecer recuperarlo como "huérfano" desde una
 * pestaña nueva si la que lo dejó ya se cerró (ver listarCarritosDeOtrasPestanas) —
 * sessionStorage se borra solo al cerrar la pestaña, así que un carrito ahí
 * sería irrecuperable.
 */

export interface CarritoPersistido<T> {
  empresaId: number;
  items:     T[];
}

const CLAVE_BASE_CARRITO = 'pos-carrito-activo';
const CLAVE_BASE_ESPERA  = 'pos-ventas-espera';
const CLAVE_TAB_ID        = 'pos_tab_id';

/**
 * Id estable de ESTA pestaña concreta. Primera llamada en la pestaña: lo
 * genera y lo guarda en sessionStorage. Llamadas siguientes (incluso tras
 * recargar): devuelve el mismo id, porque sessionStorage sobrevive a la
 * recarga de la misma pestaña.
 */
export function idDePestana(): string {
  try {
    let id = sessionStorage.getItem(CLAVE_TAB_ID);
    if (!id) {
      id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      sessionStorage.setItem(CLAVE_TAB_ID, id);
    }
    return id;
  } catch {
    // sessionStorage no disponible (modo privado muy restrictivo, etc.) —
    // degrada a una sola "pestaña" lógica por carga de página.
    return 'sin-sesion';
  }
}

function sufijoSinTab(empresaId: number, userId: number, sucursalId: number | null): string {
  return `${empresaId}:${userId}:${sucursalId ?? '_'}`;
}

export function claveCarrito(empresaId: number, userId: number, sucursalId: number | null, tabId: string): string {
  return `${CLAVE_BASE_CARRITO}:${sufijoSinTab(empresaId, userId, sucursalId)}:${tabId}`;
}

export function claveVentasEspera(empresaId: number, userId: number, sucursalId: number | null, tabId: string): string {
  return `${CLAVE_BASE_ESPERA}:${sufijoSinTab(empresaId, userId, sucursalId)}:${tabId}`;
}

/** Clave vieja (anterior a 2026-10-08), compartida entre pestañas del mismo usuario — solo para migrar una vez. */
function claveViejaPerUsuario(base: string, empresaId: number, userId: number, sucursalId: number | null): string {
  return `${base}:${sufijoSinTab(empresaId, userId, sucursalId)}`;
}

/** Prefijo (sin tabId al final) para encontrar los carritos de TODAS las pestañas de este usuario. */
function prefijoTodasPestanas(empresaId: number, userId: number, sucursalId: number | null): string {
  return `${CLAVE_BASE_CARRITO}:${sufijoSinTab(empresaId, userId, sucursalId)}:`;
}

/**
 * Lee la clave actual (por pestaña); si no hay nada, intenta migrar desde
 * cada clave legada EN ORDEN (la más reciente primero) — se consume la
 * legada siempre que exista, coincida o no la empresa, para no reintentar
 * una migración fallida en cada carga.
 */
function leerConMigracion<T>(
  claveActual: string,
  clavesLegadas: string[],
  empresaId: number,
): { items: T[]; recuperado: boolean } {
  try {
    const guardado = localStorage.getItem(claveActual);
    if (guardado) {
      const data = JSON.parse(guardado);
      const items = Array.isArray(data?.items) ? data.items : [];
      return { items, recuperado: items.length > 0 };
    }
  } catch { /* clave actual corrupta — se trata como ausente, cae a la migración */ }

  for (const claveLegada of clavesLegadas) {
    let guardadoViejo: string | null;
    try {
      guardadoViejo = localStorage.getItem(claveLegada);
    } catch { continue; }
    if (!guardadoViejo) continue;

    localStorage.removeItem(claveLegada); // se consume la clave vieja siempre, exista o no coincidencia

    try {
      const data = JSON.parse(guardadoViejo);
      if (Array.isArray(data)) return { items: [], recuperado: false }; // formato legado (aún más viejo, sin empresaId)
      if (String(data.empresaId) !== String(empresaId)) return { items: [], recuperado: false }; // no migrar entre empresas

      const items: T[] = Array.isArray(data.items) ? data.items : [];
      if (items.length > 0) {
        localStorage.setItem(claveActual, JSON.stringify({ empresaId, items }));
      }
      return { items, recuperado: items.length > 0 };
    } catch {
      return { items: [], recuperado: false };
    }
  }
  return { items: [], recuperado: false };
}

export function leerCarritoGuardado<T>(
  empresaId: number, userId: number, sucursalId: number | null, tabId: string,
): { items: T[]; recuperado: boolean } {
  return leerConMigracion<T>(
    claveCarrito(empresaId, userId, sucursalId, tabId),
    [claveViejaPerUsuario(CLAVE_BASE_CARRITO, empresaId, userId, sucursalId), CLAVE_BASE_CARRITO],
    empresaId,
  );
}

export function leerVentasEsperaGuardadas<T>(
  empresaId: number, userId: number, sucursalId: number | null, tabId: string,
): { items: T[]; recuperado: boolean } {
  return leerConMigracion<T>(
    claveVentasEspera(empresaId, userId, sucursalId, tabId),
    [claveViejaPerUsuario(CLAVE_BASE_ESPERA, empresaId, userId, sucursalId), CLAVE_BASE_ESPERA],
    empresaId,
  );
}

export function guardarCarrito<T>(
  empresaId: number, userId: number, sucursalId: number | null, tabId: string, items: T[],
): void {
  localStorage.setItem(claveCarrito(empresaId, userId, sucursalId, tabId), JSON.stringify({ empresaId, items }));
}

export function guardarVentasEspera<T>(
  empresaId: number, userId: number, sucursalId: number | null, tabId: string, items: T[],
): void {
  localStorage.setItem(claveVentasEspera(empresaId, userId, sucursalId, tabId), JSON.stringify({ empresaId, items }));
}

export interface CarritoHuerfano<T> {
  tabId: string;
  items: T[];
}

/**
 * Carritos no vacíos guardados por OTRAS pestañas de este mismo usuario
 * (empresa+sucursal), identificadas por su tabId. Pueden ser de una
 * pestaña que ya se cerró (huérfano, recuperable) o de una que sigue
 * abierta en este momento — este módulo solo lista candidatos, sin tocar
 * BroadcastChannel ni nada async: quien llama (ver posTelemetria.ts,
 * obtenerPestanasVivasConocidas) decide cuáles están realmente vivas antes
 * de ofrecer nada al cajero.
 */
export function listarCarritosDeOtrasPestanas<T>(
  empresaId: number, userId: number, sucursalId: number | null, tabIdPropio: string,
): CarritoHuerfano<T>[] {
  const prefijo = prefijoTodasPestanas(empresaId, userId, sucursalId);
  const resultado: CarritoHuerfano<T>[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const clave = localStorage.key(i);
    if (!clave || !clave.startsWith(prefijo)) continue;
    const tabId = clave.slice(prefijo.length);
    if (!tabId || tabId === tabIdPropio) continue;
    try {
      const data = JSON.parse(localStorage.getItem(clave) ?? '');
      const items: T[] = Array.isArray(data?.items) ? data.items : [];
      if (items.length > 0) resultado.push({ tabId, items });
    } catch { /* clave corrupta — se ignora */ }
  }
  return resultado;
}

/** Borra el carrito y las ventas en espera de una pestaña específica (propia o huérfana). */
export function borrarCarritoDePestana(
  empresaId: number, userId: number, sucursalId: number | null, tabId: string,
): void {
  localStorage.removeItem(claveCarrito(empresaId, userId, sucursalId, tabId));
  localStorage.removeItem(claveVentasEspera(empresaId, userId, sucursalId, tabId));
}

/** Solo para logout VOLUNTARIO — un cierre involuntario (expired/displaced/caducada) nunca llama esto. */
export function borrarCarritoYEspera(
  empresaId: number | null | undefined, userId: number | null | undefined, sucursalId: number | null, tabId: string,
): void {
  if (empresaId == null || userId == null) return;
  borrarCarritoDePestana(empresaId, userId, sucursalId, tabId);
}
