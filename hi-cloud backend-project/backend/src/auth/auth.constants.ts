/**
 * Constantes de autenticación con UN solo sitio de definición.
 *
 * ── Por qué existe este archivo ──────────────────────────────────────────────
 * `JWT_EXPIRES_IN` estaba definido en CINCO sitios con DOS valores distintos:
 *
 *   1d   →  docker-compose.yml, .env.example (raíz), backend/.env.example
 *   15m  →  app.module.ts (Joi), auth.module.ts (JwtModule), auth.controller.ts
 *
 * Ganaba el compose, así que en producción el access token vivía un DÍA mientras
 * el código afirmaba «access token de corta duración (S-28)». Tres defaults
 * duplicados en el código es la forma de garantizar que vuelvan a divergir.
 *
 * ── Por qué 15m y no 1d ──────────────────────────────────────────────────────
 * No es estética: la precisión del cierre por inactividad está limitada por la
 * vida del access token, porque el punto de control es la rotación del refresh
 * token. Con 1d, un ajuste de «30 minutos de inactividad» es incumplible — no
 * hay rotación hasta un día después. La alternativa (comprobar en JwtStrategy en
 * cada request) cuesta un SELECT por petición, justo el que se quitó a propósito
 * (ver el comentario de jwt.strategy.ts).
 *
 * Con 15m el cierre efectivo cae entre X y X+15 min. Eso debe decirlo la ayuda
 * del ajuste en la UI, o repetimos el problema de origen: un ajuste que promete
 * una cosa y mide otra.
 */
export const JWT_EXPIRES_IN_DEFAULT = '15m';

/** Margen que la cookie vive por encima del JWT, para que llegue al endpoint de refresh. */
export const COOKIE_JWT_BUFFER_MS = 5 * 60_000;

/**
 * El default ya resuelto a ms. Existe para que parseJwtExpiry() tenga un fallback
 * numérico sin recursión: si el default se cambiara a un formato que su regex no
 * acepta, recurrir sobre él no terminaría nunca.
 *
 * Si cambias JWT_EXPIRES_IN_DEFAULT, cambia también esto — el test
 * jwt-expiry.spec.ts falla si dejan de coincidir.
 */
export const JWT_EXPIRES_IN_DEFAULT_MS = 15 * 60_000;
