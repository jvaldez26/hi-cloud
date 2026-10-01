import * as Sentry from '@sentry/react';
import type { UserRole, EmpresaItem } from '../types';

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
 * Si la empresa activa no aparece en `empresas` (dato inconsistente — no
 * debería pasar nunca), NUNCA cae al rol global: eso sería ampliar
 * silenciosamente el privilegio de alguien en una empresa que no reconoce.
 * Se va al de MENOR privilegio ('viewer') y se reporta a Sentry para que
 * quede visible, en vez de fallar o sobre-privilegiar en silencio.
 */
export function resolverRolPorEmpresa(
  rolGlobal: UserRole,
  empresaActivaId: number | null | undefined,
  empresas: EmpresaItem[],
): UserRole {
  if (rolGlobal === 'super_admin') return rolGlobal;
  if (empresaActivaId == null) return rolGlobal; // sin empresa activa aún — nada que resolver

  const empresaActiva = empresas.find(e => e.empresaId === empresaActivaId);
  if (!empresaActiva) {
    Sentry.captureMessage('resolverRolPorEmpresa: la empresa activa no está en empresas[]', {
      level: 'warning',
      tags: { modulo: 'auth' },
      extra: { empresaActivaId, rolGlobal, empresasDisponibles: empresas.map(e => e.empresaId) },
    });
    return 'viewer';
  }
  return empresaActiva.rol as UserRole;
}
