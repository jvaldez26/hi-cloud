import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TarjetaSupervisor } from './entities/tarjeta-supervisor.entity';
import { SupervisorTarjetaConfig, NivelTarjetaSupervisor } from './entities/supervisor-tarjeta-config.entity';
import { generarCodigoTarjeta, hashCodigoTarjeta, ultimosCuatro } from './tarjeta-codigo.util';

/** Roles que pueden ser supervisor — MISMA lista que AuthService.verificarSupervisor/listarSupervisores. */
const ROLES_SUPERVISOR = ['admin', 'contador', 'super_admin'];

export interface TarjetaGenerada {
  codigo: string; // SOLO existe en memoria — el caller la usa para el PDF y la descarta
  ultimosCuatro: string;
  nombre: string;
  role: string;
}

export type ResultadoVerificacionTarjeta =
  | { ok: true; userId: number; nombre: string; email: string; role: string }
  | { ok: false; motivo: 'no_existe' }
  | { ok: false; motivo: 'revocada' | 'otra_empresa' | 'sin_permiso'; ownerId: number; ownerNombre: string; ownerEmail: string };

@Injectable()
export class SupervisorTarjetasService {
  private readonly logger = new Logger(SupervisorTarjetasService.name);

  constructor(
    @InjectRepository(TarjetaSupervisor) private tarjetaRepo: Repository<TarjetaSupervisor>,
    @InjectRepository(SupervisorTarjetaConfig) private configRepo: Repository<SupervisorTarjetaConfig>,
    private ds: DataSource,
  ) {}

  private async esElegible(empresaId: number, userId: number): Promise<{ nombre: string; role: string } | null> {
    const [row] = await this.ds.query<any[]>(`
      SELECT u.nombre, u.role
      FROM users u
      JOIN usuario_empresa ue ON ue."userId" = u.id
      WHERE u.id = $1 AND ue."empresaId" = $2
        AND ue."isActive" = true AND u."isActive" = true
        AND u.role::text = ANY($3::text[])
      LIMIT 1
    `, [userId, empresaId, ROLES_SUPERVISOR]);
    return row ?? null;
  }

  /**
   * Genera una tarjeta nueva — desactiva cualquier anterior de esa persona
   * en esa empresa (pedido explícito: "generar una tarjeta nueva invalida
   * la anterior"). El código SOLO vive en el valor de retorno: el caller
   * (controller) lo usa para armar el PDF en la MISMA petición y nunca lo
   * persiste ni lo manda de vuelta como JSON — así nunca pasa por el estado
   * de React ni queda en un log de red legible.
   */
  async generarTarjeta(empresaId: number, userId: number, creadoPor: number): Promise<TarjetaGenerada> {
    const elegible = await this.esElegible(empresaId, userId);
    if (!elegible) throw new BadRequestException('Este usuario no tiene rol de supervisor (admin/contador) en esta empresa');

    const codigo = generarCodigoTarjeta();
    const codigoHash = hashCodigoTarjeta(codigo);

    await this.ds.transaction(async (manager) => {
      await manager.query(`
        UPDATE tarjetas_supervisor
        SET activa = false, "revocadaEn" = NOW(), "revocadaPor" = $1, "motivoRevocacion" = 'Regenerada — se emitió una tarjeta nueva'
        WHERE "userId" = $2 AND "empresaId" = $3 AND activa = true
      `, [creadoPor, userId, empresaId]);

      await manager.getRepository(TarjetaSupervisor).insert({
        userId, empresaId, codigoHash,
        ultimosCuatro: ultimosCuatro(codigo),
        activa: true, creadaPor: creadoPor,
      });
    });

    this.logger.log(`Tarjeta de supervisor generada — empresa #${empresaId}, usuario #${userId}, por #${creadoPor}`);
    return { codigo, ultimosCuatro: ultimosCuatro(codigo), nombre: elegible.nombre, role: elegible.role };
  }

  async revocarTarjeta(empresaId: number, userId: number, revocadoPor: number, motivo: string): Promise<{ ok: boolean }> {
    const result = await this.ds.query(`
      UPDATE tarjetas_supervisor
      SET activa = false, "revocadaEn" = NOW(), "revocadaPor" = $1, "motivoRevocacion" = $2
      WHERE "userId" = $3 AND "empresaId" = $4 AND activa = true
    `, [revocadoPor, motivo, userId, empresaId]);
    const filasAfectadas = Array.isArray(result) ? result[1] : 0;
    if (!filasAfectadas) throw new NotFoundException('No hay una tarjeta activa para revocar');
    this.logger.log(`Tarjeta de supervisor revocada — empresa #${empresaId}, usuario #${userId}, por #${revocadoPor}: ${motivo}`);
    return { ok: true };
  }

  async miTarjeta(empresaId: number, userId: number) {
    const tarjeta = await this.tarjetaRepo.findOne({ where: { empresaId, userId, activa: true } });
    if (!tarjeta) return { activa: false };
    return { activa: true, ultimosCuatro: tarjeta.ultimosCuatro, creadaEn: tarjeta.creadaEn };
  }

  /** Para "Usuarios y Roles": estado de tarjeta de cada miembro elegible a supervisor. */
  async listarEquipo(empresaId: number) {
    return this.ds.query<any[]>(`
      SELECT u.id AS "userId", u.nombre, u.role,
             t."ultimosCuatro", t."creadaEn"
      FROM users u
      JOIN usuario_empresa ue ON ue."userId" = u.id
      LEFT JOIN tarjetas_supervisor t
        ON t."userId" = u.id AND t."empresaId" = $1 AND t.activa = true
      WHERE ue."empresaId" = $1 AND ue."isActive" = true AND u."isActive" = true
        AND u.role::text = ANY($2::text[])
      ORDER BY u.nombre ASC
    `, [empresaId, ROLES_SUPERVISOR]);
  }

  /**
   * Resuelve un código escaneado contra la empresa actual. Nunca lanza para
   * un código inválido/revocado/de otra empresa — devuelve el motivo, y el
   * caller (AuthService) decide cómo tratarlo (bloqueo progresivo,
   * notificación), igual que ya hace con un PIN incorrecto.
   */
  async verificarCodigo(codigo: string, empresaId: number): Promise<ResultadoVerificacionTarjeta> {
    const hash = hashCodigoTarjeta(codigo);
    const [fila] = await this.ds.query<any[]>(`
      SELECT t.id, t.activa, t."empresaId", u.id AS "userId", u.nombre, u.email, u.role,
             u."isActive" AS "usuarioActivo"
      FROM tarjetas_supervisor t
      JOIN users u ON u.id = t."userId"
      WHERE t."codigoHash" = $1
      LIMIT 1
    `, [hash]);

    if (!fila) return { ok: false, motivo: 'no_existe' };

    const owner = { ownerId: fila.userId, ownerNombre: fila.nombre, ownerEmail: fila.email };

    if (!fila.activa) return { ok: false, motivo: 'revocada', ...owner };
    if (fila.empresaId !== empresaId) return { ok: false, motivo: 'otra_empresa', ...owner };

    // El rol pudo cambiar DESPUÉS de emitir la tarjeta (p. ej. un admin bajado
    // a vendedor) — se revalida contra la empresa actual, no contra lo que
    // tenía al momento de generarla.
    const elegible = await this.esElegible(empresaId, fila.userId);
    if (!fila.usuarioActivo || !elegible) return { ok: false, motivo: 'sin_permiso', ...owner };

    return { ok: true, userId: fila.userId, nombre: fila.nombre, email: fila.email, role: fila.role };
  }

  /** Nombre de empresa (comercial o razón social) y sucursal — para el PDF de la tarjeta. */
  async datosEmpresaYSucursal(empresaId: number, sucursalId?: number | null): Promise<{ empresaNombre: string; sucursalNombre: string | null }> {
    const [[empresa], sucursalRows] = await Promise.all([
      this.ds.query<{ nombre: string; nombreComercial: string | null }[]>(
        `SELECT nombre, "nombreComercial" FROM empresa WHERE id = $1`, [empresaId],
      ),
      sucursalId
        ? this.ds.query<{ nombre: string }[]>(`SELECT nombre FROM sucursales WHERE id = $1`, [sucursalId])
        : Promise.resolve([] as { nombre: string }[]),
    ]);
    return {
      empresaNombre: empresa?.nombreComercial || empresa?.nombre || `Empresa #${empresaId}`,
      sucursalNombre: sucursalRows[0]?.nombre ?? null,
    };
  }

  async obtenerNivel(empresaId: number): Promise<NivelTarjetaSupervisor> {
    const cfg = await this.configRepo.findOne({ where: { empresaId } });
    return cfg?.nivel ?? 'solo_tarjeta';
  }

  async actualizarNivel(empresaId: number, nivel: NivelTarjetaSupervisor, adminId: number): Promise<{ ok: boolean }> {
    await this.ds.query(`
      INSERT INTO supervisor_tarjeta_config ("empresaId", nivel, "actualizadoPor", "actualizadoEn")
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT ("empresaId") DO UPDATE SET nivel = $2, "actualizadoPor" = $3, "actualizadoEn" = NOW()
    `, [empresaId, nivel, adminId]);
    return { ok: true };
  }
}
