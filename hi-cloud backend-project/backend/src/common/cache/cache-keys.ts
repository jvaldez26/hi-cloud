/**
 * Claves de caché centralizadas.
 * Usar siempre estas constantes para invalidar correctamente.
 *
 * TTL en ms:
 *   EMPRESA_CONFIG  → 1h   (cambia solo en Configuración)
 *   PRODUCTOS_POS   → 5min (cambia al editar productos)
 *   SECUENCIAS_ECF  → 10min (cambia al agotar secuencia)
 *   CATEGORIAS      → 1h   (catálogos estáticos)
 *   PLAN_INFO       → 30min (cambia al renovar plan)
 */
export const CacheKeys = {
  empresaConfig:  (empresaId: number) => `empresa:config:${empresaId}`,
  productosPOS:   (empresaId: number) => `productos:pos:${empresaId}`,
  secuenciasECF:  (empresaId: number) => `ecf:secuencias:${empresaId}`,
  categorias:     (empresaId: number) => `categorias:${empresaId}`,
  planInfo:       (empresaId: number) => `plan:${empresaId}`,
  // Token de autenticación MSeller por empresa (multi-instancia safe via Redis)
  msellerToken:   (empresaId: number) => `mseller:token:${empresaId}`,
} as const;

export const CacheTTL = {
  EMPRESA_CONFIG: 3_600_000,   // 1 hora
  PRODUCTOS_POS:    300_000,   // 5 minutos
  SECUENCIAS_ECF:   600_000,   // 10 minutos
  CATEGORIAS:     3_600_000,   // 1 hora
  PLAN_INFO:      1_800_000,   // 30 minutos
  MSELLER_TOKEN:  3_300_000,   // 55 minutos (Cognito emite tokens de 1h; 5 min de margen)
} as const;
