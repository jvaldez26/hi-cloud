import * as Sentry from '@sentry/react';
import type { UserRole, EmpresaItem } from '../types';

export interface RolResuelto {
  rol: UserRole;
  /** La empresa activa ya corregida — puede diferir de la que se pidió resolver (ver abajo). */
  empresaActivaId: number | null;
}

/**
 * El backend (RolesGuard) autoriza con el rol de `usuario_empresa` para la
 * empresa ACTIVA, no con el rol global de `users.role` — ver el comentario
 * de RolesGuard.canActivate() en el backend. El frontend tiene que decidir
 * con esa misma fuente en todo momento, o un usuario admin en una empresa
 * pero con otro rol global (ej. contador en su empresa principal) ve
 * controles deshabilitados sin ninguna petición ni mensaje ("inerte en
 * silencio" — el bug real detrás del switch de HiCloud Xlink que no se
 * activaba).
 *
 * Única fuente de esta corrección en todo el frontend — login(),
 * cambiarEmpresa() y la rehidratación de /auth/me la llaman, nadie la
 * reimplementa. super_admin es la única excepción real: no tiene fila en
 * usuario_empresa (es global por diseño), así que se respeta tal cual.
 *
 * Caso real (2026-10-03): admins que entraban y veían VIEWER de forma
 * intermitente, hasta cerrar sesión y volver a entrar. Causa — esta función
 * SÍ degradaba a 'viewer' cuando `empresas` venía VACÍO (ej. justo después
 * de un login con Google, o con el store aún sin refrescar su copia de
 * `empresas` mientras AppLayout ya había resuelto una empresa activa desde
 * /auth/mis-empresas, una fuente más fresca que vive aparte). Vacío no es
 * evidencia de nada — probablemente los datos reales todavía no llegaron.
 * Ahora el castigo (nunca 'viewer' a secas; se cae a la empresa
 * predeterminada del usuario, CON su rol real) solo aplica cuando hay una
 * lista de verdad que de plano no incluye la empresa activa pedida.
 *
 * Los ids se comparan normalizados con Number() — localStorage, el id
 * guardado en el JWT o el de una respuesta HTTP pueden no coincidir en tipo
 * aunque representen el mismo id.
 */
export function resolverRolPorEmpresa(
  rolGlobal: UserRole,
  empresaActivaId: number | null | undefined,
  empresas: EmpresaItem[],
): RolResuelto {
  if (rolGlobal === 'super_admin') {
    return { rol: rolGlobal, empresaActivaId: empresaActivaId ?? null };
  }
  if (empresaActivaId == null) {
    return { rol: rolGlobal, empresaActivaId: null }; // sin empresa activa aún — nada que resolver
  }

  const idPedido = Number(empresaActivaId);
  const empresaActiva = empresas.find(e => Number(e.empresaId) === idPedido);
  if (empresaActiva) {
    return { rol: empresaActiva.rol as UserRole, empresaActivaId: idPedido };
  }

  if (empresas.length === 0) {
    // No hay lista todavía (no es lo mismo que "la empresa no está en la
    // lista") — mantener el rol global y el id pedido tal cual, sin castigo,
    // hasta que llegue una lista real con la que decidir de verdad.
    return { rol: rolGlobal, empresaActivaId: idPedido };
  }

  // Hay lista, y de verdad no incluye la empresa activa pedida — dato
  // inconsistente (ej. empresaId en localStorage de una empresa a la que el
  // usuario ya no tiene acceso, o de otro usuario en un equipo compartido).
  // Nunca se sube de privilegio inventando una empresa: se cae a una empresa
  // REAL del usuario (su principal, o la primera de la lista), con el rol
  // que de verdad tiene ahí — nunca un 'viewer' genérico que no corresponde
  // a ninguna fila real de usuario_empresa.
  const predeterminada = empresas.find(e => e.isPrincipal) ?? empresas[0];
  Sentry.captureMessage(
    'resolverRolPorEmpresa: la empresa activa no está en empresas[] — se usó la empresa predeterminada',
    {
      level: 'warning',
      tags: { modulo: 'auth' },
      extra: {
        empresaActivaIdPedida: idPedido,
        rolGlobal,
        empresaPredeterminada: predeterminada.empresaId,
        empresasDisponibles: empresas.map(e => e.empresaId),
      },
    },
  );
  return { rol: predeterminada.rol as UserRole, empresaActivaId: Number(predeterminada.empresaId) };
}
