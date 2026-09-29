import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../../users/enums/user-role.enum';

/**
 * ¿Puede este usuario ver Auditoría? SUPER_ADMIN y ADMIN siempre; CONTADOR
 * solo si la empresa activó `empresa.contadorPuedeVerAuditoria` (ajuste que
 * solo el Admin puede cambiar, ver configuracion.controller.ts). Cualquier
 * otro rol ya fue bloqueado por el @Roles() de la ruta antes de llegar
 * aquí — este guard corre DESPUÉS de RolesGuard en la misma lista de
 * @UseGuards(), nunca lo reemplaza.
 *
 * Va como guard (no como filtro dentro del service) a propósito: "ocultar
 * el menú no alcanza" — debe rechazar con 403 aunque se entre por URL
 * directa, sin importar qué controller/método sea.
 *
 * No reusa el `effRole` de RolesGuard (se calcula y se descarta ahí mismo,
 * nunca se adjunta de vuelta al request — ver el comentario de B-03 en
 * roles.guard.ts) — resuelve el rol EFECTIVO en la empresa activa por su
 * cuenta, con la misma consulta a usuario_empresa, porque `usuario.role`
 * del JWT es el de la empresa PRINCIPAL del usuario, no necesariamente el
 * de la empresa activa de esta sesión (mismo caso multi-empresa que ya
 * documentó ese guard).
 */
@Injectable()
export class AuditoriaAccessGuard implements CanActivate {
  constructor(@InjectDataSource() private ds: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const usuario = req.user as { id?: number; role?: string; empresaId?: number } | undefined;
    if (!usuario?.id) return false;

    const empresaId = usuario.empresaId;
    let rolEfectivo = usuario.role;
    if (empresaId) {
      const [membresia] = await this.ds.query<{ rol: string }[]>(
        `SELECT rol FROM usuario_empresa WHERE "userId" = $1 AND "empresaId" = $2 AND "isActive" = true LIMIT 1`,
        [usuario.id, empresaId],
      );
      if (membresia?.rol) rolEfectivo = membresia.rol;
    }

    if (rolEfectivo === UserRole.SUPER_ADMIN || rolEfectivo === UserRole.ADMIN) return true;
    // Cualquier rol que no sea CONTADOR ya debió ser rechazado por el
    // @Roles() de la ruta antes de que este guard corriera — no es este
    // guard quien decide eso.
    if (rolEfectivo !== UserRole.CONTADOR) return true;

    if (!empresaId) throw new ForbiddenException('Se requiere contexto de empresa para consultar Auditoría.');

    const [empresa] = await this.ds.query<{ contadorPuedeVerAuditoria: boolean }[]>(
      `SELECT "contadorPuedeVerAuditoria" FROM empresa WHERE id = $1`,
      [empresaId],
    );
    if (!empresa?.contadorPuedeVerAuditoria) {
      throw new ForbiddenException('Tu empresa no habilitó el acceso de Contador a Auditoría.');
    }
    return true;
  }
}
