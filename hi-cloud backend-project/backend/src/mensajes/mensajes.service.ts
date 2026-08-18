import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';
import { TenantService }    from '../tenant/tenant.service';
import { CreateMensajeDto } from './dto/create-mensaje.dto';
import { UpdateMensajeDto } from './dto/update-mensaje.dto';

// Filtro WHERE compartido por múltiples queries
// IMPORTANTE: suscripciones.plan es un ENUM de PostgreSQL (suscripciones_plan_enum).
// Comparar m."destinatarioPlan" (varchar) directamente contra ese ENUM falla con
// "no existe el operador". Se castea a ::text antes de comparar.
const DESTINATARIO_FILTER = `
  (
    m.destinatario = 'todas'
    OR (m.destinatario = 'lista' AND $2::int = ANY(m."destinatarioIds"))
    OR (m.destinatario = 'plan'  AND m."destinatarioPlan" = s.plan::text)
  )
`;

const MENSAJES_ACTIVOS_WHERE = `
  m.activo = true
  AND m."fechaPublicacion" <= now()
  AND (m."fechaExpiracion" IS NULL OR m."fechaExpiracion" > now())
`;

@Injectable()
export class MensajesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantService: TenantService,
  ) {}

  // ─────────────────────────────────────────────────────────
  //  CLIENTE — endpoints del ERP
  // ─────────────────────────────────────────────────────────

  /**
   * Mensajes visibles para el usuario en su empresa activa.
   * tab=principal  → avisos no archivados
   * tab=novedades  → novedades no archivadas
   * tab=archivo    → cualquier tipo, archivados
   */
  async getBandeja(
    usuarioId: number,
    tab: 'principal' | 'novedades' | 'archivo' = 'principal',
  ) {
    const empresaId = this.tenantService.getEmpresaId();

    const tipoFilter = tab === 'principal' ? `AND m.tipo = 'aviso'`
                     : tab === 'novedades' ? `AND m.tipo = 'novedad'`
                     : '';

    // Archivo: solo mensajes que el usuario archivó (ml.archivadoEn IS NOT NULL)
    // Principal/Novedades: excluir archivados (la row puede no existir — LEFT JOIN → null es OK)
    const archivadoFilter = tab === 'archivo'
      ? `AND ml."archivadoEn" IS NOT NULL`
      : `AND (ml."archivadoEn" IS NULL)`;

    return this.ds.query(`
      SELECT
        m.id,
        m.titulo,
        m.cuerpo,
        m.tipo,
        m."fechaPublicacion",
        m."editadoEn",
        ml."leidoEn",
        ml."vistoEn",
        ml."archivadoEn"
      FROM mensajes m
      -- Estado de lectura del usuario (puede no existir → mensajes no leídos)
      LEFT JOIN mensajes_lectura ml
        ON ml."mensajeId" = m.id AND ml."usuarioId" = $1
      -- Plan de la empresa activa para filtrar por plan
      -- El cast ::text es obligatorio: suscripciones.plan es ENUM, destinatarioPlan es varchar
      LEFT JOIN suscripciones s
        ON s."empresaId" = $2 AND s.activa = true
      WHERE ${MENSAJES_ACTIVOS_WHERE}
        ${tipoFilter}
        ${archivadoFilter}
        AND ${DESTINATARIO_FILTER}
      ORDER BY m."fechaPublicacion" DESC
    `, [usuarioId, empresaId]);
  }

  /** Conteo de mensajes no leídos (no archivados) para el badge del menú */
  async getNoLeidosCount(usuarioId: number): Promise<number> {
    const empresaId = this.tenantService.getEmpresaId();
    const [{ count }] = await this.ds.query(`
      SELECT COUNT(*)::int AS count
      FROM mensajes m
      LEFT JOIN mensajes_lectura ml
        ON ml."mensajeId" = m.id AND ml."usuarioId" = $1
      -- cast ::text obligatorio para comparar ENUM contra varchar
      LEFT JOIN suscripciones s
        ON s."empresaId" = $2 AND s.activa = true
      WHERE ${MENSAJES_ACTIVOS_WHERE}
        AND (ml."leidoEn"     IS NULL)
        AND (ml."archivadoEn" IS NULL)
        AND ${DESTINATARIO_FILTER}
    `, [usuarioId, empresaId]);
    return count ?? 0;
  }

  /**
   * Novedades que el usuario no ha visto como toast todavía.
   * Se llama al montar AppLayout; el frontend muestra el toast y llama marcarVisto.
   */
  async getNovedadesNoVistas(usuarioId: number): Promise<string[]> {
    const empresaId = this.tenantService.getEmpresaId();
    const rows = await this.ds.query(`
      SELECT m.id
      FROM mensajes m
      LEFT JOIN mensajes_lectura ml
        ON ml."mensajeId" = m.id AND ml."usuarioId" = $1
      -- cast ::text obligatorio para ENUM vs varchar
      LEFT JOIN suscripciones s
        ON s."empresaId" = $2 AND s.activa = true
      WHERE ${MENSAJES_ACTIVOS_WHERE}
        AND m.tipo = 'novedad'
        AND (ml."vistoEn"     IS NULL)
        AND (ml."archivadoEn" IS NULL)
        AND ${DESTINATARIO_FILTER}
      ORDER BY m."fechaPublicacion" DESC
    `, [usuarioId, empresaId]);
    return rows.map((r: any) => r.id as string);
  }

  /** Marca un mensaje como leído (leidoEn) para el usuario */
  async marcarLeido(mensajeId: string, usuarioId: number): Promise<void> {
    await this.ds.query(`
      INSERT INTO mensajes_lectura ("mensajeId", "usuarioId", "leidoEn")
      VALUES ($1, $2, now())
      ON CONFLICT ("mensajeId", "usuarioId")
      DO UPDATE SET "leidoEn" = COALESCE(mensajes_lectura."leidoEn", EXCLUDED."leidoEn")
    `, [mensajeId, usuarioId]);
  }

  /** Marca un mensaje como visto-toast (vistoEn) — no implica leído */
  async marcarVisto(mensajeId: string, usuarioId: number): Promise<void> {
    await this.ds.query(`
      INSERT INTO mensajes_lectura ("mensajeId", "usuarioId", "vistoEn")
      VALUES ($1, $2, now())
      ON CONFLICT ("mensajeId", "usuarioId")
      DO UPDATE SET "vistoEn" = COALESCE(mensajes_lectura."vistoEn", EXCLUDED."vistoEn")
    `, [mensajeId, usuarioId]);
  }

  /** Archiva un mensaje para el usuario */
  async archivar(mensajeId: string, usuarioId: number): Promise<void> {
    await this.ds.query(`
      INSERT INTO mensajes_lectura ("mensajeId", "usuarioId", "archivadoEn", "leidoEn")
      VALUES ($1, $2, now(), now())
      ON CONFLICT ("mensajeId", "usuarioId")
      DO UPDATE SET
        "archivadoEn" = COALESCE(mensajes_lectura."archivadoEn", EXCLUDED."archivadoEn"),
        "leidoEn"     = COALESCE(mensajes_lectura."leidoEn",     EXCLUDED."leidoEn")
    `, [mensajeId, usuarioId]);
  }

  /** Marca todos los mensajes de una pestaña como leídos */
  async marcarTodosLeidos(usuarioId: number, tab: 'principal' | 'novedades'): Promise<void> {
    const empresaId = this.tenantService.getEmpresaId();
    const tipoFilter = tab === 'principal' ? `AND m.tipo = 'aviso'` : `AND m.tipo = 'novedad'`;

    // Obtiene IDs de todos los mensajes no leídos de la pestaña
    const ids: { id: string }[] = await this.ds.query(`
      SELECT m.id
      FROM mensajes m
      LEFT JOIN mensajes_lectura ml ON ml."mensajeId" = m.id AND ml."usuarioId" = $1
      LEFT JOIN suscripciones s     ON s."empresaId" = $2 AND s.activa = true
      WHERE ${MENSAJES_ACTIVOS_WHERE}
        ${tipoFilter}
        AND (ml."leidoEn"     IS NULL)
        AND (ml."archivadoEn" IS NULL)
        AND ${DESTINATARIO_FILTER}
    `, [usuarioId, empresaId]);

    if (ids.length === 0) return;

    // Upsert masivo
    const values = ids.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, now())`).join(', ');
    const params = ids.flatMap(r => [r.id, usuarioId]);
    await this.ds.query(`
      INSERT INTO mensajes_lectura ("mensajeId", "usuarioId", "leidoEn")
      VALUES ${values}
      ON CONFLICT ("mensajeId", "usuarioId")
      DO UPDATE SET "leidoEn" = COALESCE(mensajes_lectura."leidoEn", EXCLUDED."leidoEn")
    `, params);
  }

  // ─────────────────────────────────────────────────────────
  //  SUPER ADMIN — gestión de mensajes
  // ─────────────────────────────────────────────────────────

  async adminListar() {
    return this.ds.query(`
      SELECT
        m.*,
        u.nombre AS "autorNombre",
        COUNT(ml.id) FILTER (WHERE ml."leidoEn" IS NOT NULL)::int AS "totalLeidos",
        COUNT(ml.id)::int AS "totalInteracciones"
      FROM mensajes m
      LEFT JOIN users               u  ON u.id = m."createdBy"
      LEFT JOIN mensajes_lectura    ml ON ml."mensajeId" = m.id
      GROUP BY m.id, u.nombre
      ORDER BY m."createdAt" DESC
    `);
  }

  async adminCrear(dto: CreateMensajeDto, createdBy: number): Promise<{ id: string }> {
    const [{ id }] = await this.ds.query(`
      INSERT INTO mensajes (
        titulo, cuerpo, tipo, destinatario,
        "destinatarioIds", "destinatarioPlan",
        "fechaPublicacion", "fechaExpiracion",
        activo, "createdBy"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      dto.titulo,
      dto.cuerpo,
      dto.tipo,
      dto.destinatario,
      dto.destinatarioIds ?? null,
      dto.destinatarioPlan ?? null,
      dto.fechaPublicacion,
      dto.fechaExpiracion ?? null,
      dto.activo ?? true,
      createdBy,
    ]);
    return { id };
  }

  /**
   * Permite editar un mensaje ya publicado.
   * Si se edita el cuerpo o título, actualiza editadoEn para registro de auditoría.
   */
  async adminEditar(id: string, dto: UpdateMensajeDto): Promise<void> {
    const existing = await this.ds.query(
      `SELECT id FROM mensajes WHERE id = $1`,
      [id],
    );
    if (!existing.length) throw new NotFoundException(`Mensaje ${id} no encontrado`);

    const editaCuerpo = dto.titulo !== undefined || dto.cuerpo !== undefined;

    // El tipo ('aviso'|'novedad') no se puede cambiar post-publicación.
    // El cuerpo y título sí pueden editarse; editadoEn queda como registro.
    await this.ds.query(`
      UPDATE mensajes SET
        titulo             = COALESCE($2, titulo),
        cuerpo             = COALESCE($3, cuerpo),
        destinatario       = COALESCE($4, destinatario),
        "destinatarioIds"  = COALESCE($5, "destinatarioIds"),
        "destinatarioPlan" = COALESCE($6, "destinatarioPlan"),
        "fechaPublicacion" = COALESCE($7, "fechaPublicacion"),
        "fechaExpiracion"  = COALESCE($8, "fechaExpiracion"),
        activo             = COALESCE($9, activo),
        "editadoEn"        = CASE WHEN $10 THEN now() ELSE "editadoEn" END,
        "updatedAt"        = now()
      WHERE id = $1
    `, [
      id,
      dto.titulo           ?? null,
      dto.cuerpo           ?? null,
      dto.destinatario     ?? null,
      dto.destinatarioIds  ?? null,
      dto.destinatarioPlan ?? null,
      dto.fechaPublicacion ?? null,
      dto.fechaExpiracion  ?? null,
      dto.activo           ?? null,
      editaCuerpo,
    ]);
  }

  async adminDesactivar(id: string): Promise<void> {
    await this.ds.query(
      `UPDATE mensajes SET activo = false, "updatedAt" = now() WHERE id = $1`,
      [id],
    );
  }

  async adminStats(id: string) {
    const [stats] = await this.ds.query(`
      SELECT
        COUNT(ml.id)::int                                                AS "totalInteracciones",
        COUNT(ml.id) FILTER (WHERE ml."leidoEn" IS NOT NULL)::int       AS "totalLeidos",
        COUNT(ml.id) FILTER (WHERE ml."vistoEn" IS NOT NULL)::int       AS "totalVistos",
        COUNT(ml.id) FILTER (WHERE ml."archivadoEn" IS NOT NULL)::int   AS "totalArchivados"
      FROM mensajes_lectura ml
      WHERE ml."mensajeId" = $1
    `, [id]);
    return stats;
  }
}
