import { DataSource } from 'typeorm';
import { fechaHoyRD } from '../utils/fecha-local.util';

/**
 * Caja ABIERTA de HOY para este usuario — misma prioridad en todos los
 * caminos que imputan efectivo a una caja (Recibos de Cobro, CxC directo,
 * CxP directo): el POS puede mandar `vendedorId` explícito; si no, se busca
 * el perfil de vendedor ligado al usuario autenticado; si tampoco hay
 * perfil (admin/contador sin perfil de vendedor que abrió su propia caja),
 * se cae a buscar por `userId` directo.
 *
 * `null` significa "no hay caja abierta" — el llamador decide si eso es un
 * error (ver CxC/CxP: cobrar o pagar en efectivo EXIGE una caja abierta,
 * desde el incidente 2026-10-15/16 — antes ese efectivo no quedaba en
 * ningún lado del sistema) o algo tolerable (Recibos de Cobro ya lo exige
 * también, ver recibos-cobro.service.ts).
 */
export async function resolverCajaDiariaAbierta(
  dataSource: DataSource,
  empresaId: number,
  usuarioId: number,
  vendedorId?: number,
): Promise<number | null> {
  const hoy = fechaHoyRD();

  if (vendedorId) {
    const rows = await dataSource.query<{ id: number }[]>(
      `SELECT id FROM cierres_caja
       WHERE "empresaId" = $1 AND DATE(fecha) = $2
         AND estado = 'abierta' AND "vendedorId" = $3 LIMIT 1`,
      [empresaId, hoy, vendedorId],
    );
    if (rows[0]?.id) return rows[0].id;
  }

  const perfilRows = await dataSource.query<{ id: number }[]>(
    `SELECT id FROM vendedores WHERE "usuarioId" = $1 AND "empresaId" = $2 AND "isActive" = true LIMIT 1`,
    [usuarioId, empresaId],
  ).catch(() => []);
  const perfilVendedorId = perfilRows[0]?.id;

  if (perfilVendedorId) {
    const rows = await dataSource.query<{ id: number }[]>(
      `SELECT id FROM cierres_caja
       WHERE "empresaId" = $1 AND DATE(fecha) = $2
         AND estado = 'abierta' AND "vendedorId" = $3 LIMIT 1`,
      [empresaId, hoy, perfilVendedorId],
    );
    if (rows[0]?.id) return rows[0].id;
  }

  // Sin perfil de vendedor (o sin caja a su nombre) — la propia caja del
  // usuario, por si un ADMIN/CONTADOR la abrió directamente sin perfil.
  const rowsUsuario = await dataSource.query<{ id: number }[]>(
    `SELECT id FROM cierres_caja
     WHERE "empresaId" = $1 AND DATE(fecha) = $2
       AND estado = 'abierta' AND "userId" = $3 LIMIT 1`,
    [empresaId, hoy, usuarioId],
  );
  if (rowsUsuario[0]?.id) return rowsUsuario[0].id;

  return null;
}
