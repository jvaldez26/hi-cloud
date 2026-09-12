import { Injectable, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsuarioEmpresa } from '../multi-empresa/entities/usuario-empresa.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { RefreshTokenService } from './refresh-token.service';
import { AuthService } from './auth.service';

/**
 * Roles cuya sesión puede cerrar un ADMIN de empresa. Deliberadamente NO
 * incluye ADMIN ni SUPER_ADMIN: un admin comprometido no debe poder expulsar
 * al resto de la administración — eso queda reservado exclusivamente al
 * super admin (auth.controller.ts: POST /auth/usuarios/:id/cerrar-sesion,
 * @Roles(SUPER_ADMIN)).
 */
const ROLES_CERRABLES_POR_ADMIN: readonly string[] = [
  UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER, UserRole.EMPLEADO,
];

export interface SesionEquipoDto {
  usuarioId:       number;
  usuarioNombre:   string;
  rol:             string;
  sucursal:        string | null;
  dispositivo:     string;
  esMovil:         boolean;
  ubicacion:       string;
  ultimaActividad: string;
  puedeSerCerrada: boolean;
}

@Injectable()
export class EquipoSesionesService {
  private readonly logger = new Logger(EquipoSesionesService.name);

  /**
   * IP → ubicación resuelta ("Ciudad, PAÍS"). Vive en el proceso (no en
   * Redis/BD): es una optimización de una llamada externa, no un dato que
   * necesite consistencia entre instancias PM2 — el mismo trade-off que
   * `activityThrottle` en RefreshTokenService.
   */
  private readonly cacheUbicacion = new Map<string, string>();

  constructor(
    @InjectRepository(UsuarioEmpresa)
    private ueRepo: Repository<UsuarioEmpresa>,
    private refreshTokenSvc: RefreshTokenService,
    private authService: AuthService,
  ) {}

  /**
   * Sesiones activas del equipo, listas para pantalla — nunca expone el
   * User-Agent crudo ni la IP completa (regla de la feature): el
   * dispositivo ya llega parseado a un nombre corto y la IP se resuelve a
   * país aquí mismo, en el servidor. Eso va al log de auditoría si hace
   * falta, no a la pantalla del admin.
   */
  async listar(empresaId: number, solicitanteId: number): Promise<SesionEquipoDto[]> {
    const filas = await this.refreshTokenSvc.sesionesActivasEquipo(empresaId, solicitanteId);

    const ipsUnicas = [...new Set(filas.map(f => f.ipAddress).filter((ip): ip is string => !!ip))];
    await Promise.all(ipsUnicas.map(ip => this.resolverUbicacion(ip)));

    return filas.map(f => {
      const { nombre, esMovil } = this.parsearDispositivo(f.deviceInfo ?? undefined);
      return {
        usuarioId:       f.usuarioId,
        usuarioNombre:   f.usuarioNombre,
        rol:             f.rol,
        sucursal:        f.sucursalNombre,
        dispositivo:     nombre,
        esMovil,
        ubicacion:       f.ipAddress ? (this.cacheUbicacion.get(f.ipAddress) ?? '—') : '—',
        ultimaActividad: (f.ultimaActividad ?? f.creadaEn).toISOString(),
        puedeSerCerrada: ROLES_CERRABLES_POR_ADMIN.includes(f.rol),
      };
    });
  }

  /**
   * Cierra la sesión activa de un usuario del equipo. Dos validaciones
   * OBLIGATORIAS antes de tocar nada — el patrón exacto que faltó en la
   * escalada de /multi-empresa (S-60/S-61): rol sin pertenencia.
   *
   *   1. Pertenencia: el usuario objetivo debe pertenecer a la MISMA
   *      empresa que el admin solicitante (empresaId sale del CLS, nunca
   *      del request — lo resuelve el controller con TenantService).
   *   2. Jerarquía: el rol del objetivo EN ESA EMPRESA debe estar en la
   *      lista de roles cerrables por un admin (nunca admin ni super_admin).
   *
   * El cierre real (sessionToken=NULL + revocar refresh tokens) y su
   * registro en auditoría viven en AuthService.forzarLogout() — único punto
   * que hace esto, reutilizado también por el super admin.
   */
  async cerrarSesionDeUsuario(
    empresaId: number,
    admin: { id: number; nombre: string },
    targetUserId: number,
    ip: string | undefined,
  ): Promise<void> {
    if (targetUserId === admin.id) {
      throw new BadRequestException('Usa "Dispositivos conectados" para cerrar tu propia sesión');
    }

    const membresia = await this.ueRepo.findOne({
      where: { userId: targetUserId, empresaId, isActive: true },
    });

    if (!membresia) {
      this.logger.warn(
        `[equipo-sesiones] admin #${admin.id} intentó cerrar la sesión del usuario ` +
        `#${targetUserId}, que no pertenece a la empresa #${empresaId}`,
      );
      throw new ForbiddenException(`El usuario #${targetUserId} no pertenece a tu empresa`);
    }

    if (!ROLES_CERRABLES_POR_ADMIN.includes(membresia.rol)) {
      this.logger.warn(
        `[equipo-sesiones] admin #${admin.id} intentó cerrar la sesión del usuario ` +
        `#${targetUserId} (rol ${membresia.rol}) — jerarquía no lo permite`,
      );
      throw new ForbiddenException('No puedes cerrar la sesión de un administrador');
    }

    await this.authService.forzarLogout(
      targetUserId,
      { id: admin.id, nombre: admin.nombre, role: UserRole.ADMIN, empresaId },
      ip,
    );
  }

  // ── Helpers de presentación ──────────────────────────────────────────────

  /** Mismo criterio que ProfilePage.tsx (frontend) — se duplica aquí porque
   *  el User-Agent crudo nunca debe llegar al navegador del admin. */
  private parsearDispositivo(ua: string | undefined): { nombre: string; esMovil: boolean } {
    if (!ua) return { nombre: 'Dispositivo desconocido', esMovil: false };
    const s = ua.toLowerCase();
    if (s.includes('iphone'))    return { nombre: 'Apple iPhone', esMovil: true  };
    if (s.includes('ipad'))      return { nombre: 'Apple iPad',   esMovil: true  };
    if (s.includes('android'))   return { nombre: 'Android',      esMovil: true  };
    if (s.includes('macintosh') || s.includes('mac os x')) return { nombre: 'Mac', esMovil: false };
    if (s.includes('windows'))   return { nombre: 'Windows PC',   esMovil: false };
    if (s.includes('linux'))     return { nombre: 'Linux',        esMovil: false };
    return { nombre: 'Dispositivo desconocido', esMovil: false };
  }

  /**
   * Ubicación aproximada a nivel de ciudad — nunca se manda la IP al
   * navegador del admin, se resuelve aquí y solo "Ciudad, PAÍS" llega a la
   * pantalla. ipwho.is da ciudad/región (no solo país, como el servicio
   * anterior) y funciona por HTTPS sin API key para este volumen de uso.
   */
  private async resolverUbicacion(ip: string): Promise<void> {
    if (this.cacheUbicacion.has(ip)) return;
    if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.1')
        || ip === '127.0.0.1' || ip === '::1') {
      this.cacheUbicacion.set(ip, 'Local');
      return;
    }
    try {
      // Timeout corto: si ipwho.is está lento o caído, la pantalla del admin
      // no debe quedarse esperando — degrada a "—" en vez de colgarse.
      const r = await fetch(`https://ipwho.is/${ip}`, { signal: AbortSignal.timeout(3000) });
      const d = await r.json();
      if (!d?.success) {
        this.cacheUbicacion.set(ip, '—');
        return;
      }
      const partes = [d.city, d.country_code || d.country].filter(Boolean);
      this.cacheUbicacion.set(ip, partes.length ? partes.join(', ') : '—');
    } catch {
      this.cacheUbicacion.set(ip, '—');
    }
  }
}
