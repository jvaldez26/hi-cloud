import { DataSource } from 'typeorm';

/**
 * Caso real (empresa VENTAS DIVERSAS ELIDO, 2026-10-14): una autorización de
 * modo 'cada_vez' (token de un solo uso) quedaba para siempre "Activa" en
 * el reporte de Modo Supervisor — nadie la cerraba al consumirse, a
 * diferencia de modo 'sesion' (cerrada manual o por expiración, ver
 * AuthService.cerrarSesionSupervisor). Una autorización de un solo uso que
 * ya se gastó no está "activa": nadie puede volver a usarla.
 *
 * Mismo patrón idempotente que cerrarSesionSupervisor (busca la activación,
 * no hace nada si ya tiene cierre) — se llama desde los 4 sitios que
 * consumen un token ('cada_vez'): facturas.service.ts (venta a crédito),
 * caja.service.ts (descuadre de cierre), requiere-supervisor.guard.ts y
 * requiere-supervisor-siempre.guard.ts (el resto del catálogo). Best-effort:
 * un fallo aquí nunca debe deshacer ni bloquear la operación real que el
 * token ya autorizó — por eso no lanza, solo registra el error.
 */
export async function cerrarPosSupervisorLogPorConsumo(
  ds: DataSource,
  posSupervisorLogId: number | null | undefined,
): Promise<void> {
  if (!posSupervisorLogId) return;

  const [activacion] = await ds.query<any[]>(`
    SELECT "empresaId", "cajeroId", "supervisorId", "supervisorNombre", "sucursalId"
    FROM pos_supervisor_log
    WHERE id = $1 AND "sessionId" IS NULL
    LIMIT 1
  `, [posSupervisorLogId]).catch(() => [] as any[]);
  if (!activacion) return;

  const [yaCerrada] = await ds.query<any[]>(
    `SELECT id FROM pos_supervisor_log WHERE "sessionId" = $1 LIMIT 1`, [posSupervisorLogId],
  ).catch(() => [] as any[]);
  if (yaCerrada) return;

  await ds.query(`
    INSERT INTO pos_supervisor_log
      ("empresaId", "cajeroId", "supervisorId", "supervisorNombre", "sucursalId", action, detail, "sessionId", "createdAt")
    VALUES ($1, $2, $3, $4, $5, 'Cerrar modo supervisor', 'Autorización de un solo uso consumida', $6, NOW())
  `, [
    activacion.empresaId, activacion.cajeroId, activacion.supervisorId, activacion.supervisorNombre,
    activacion.sucursalId, posSupervisorLogId,
  ]).catch(() => { /* auditoría best-effort — nunca deshace la operación que el token ya autorizó */ });
}
