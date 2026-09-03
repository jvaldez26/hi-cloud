import { Injectable, NotFoundException, Optional, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';
import { TenantService }    from '../tenant/tenant.service';
import { CreateMensajeDto } from './dto/create-mensaje.dto';
import { UpdateMensajeDto } from './dto/update-mensaje.dto';
import { RealtimeService }  from '../realtime/realtime.service';

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
  private readonly logger = new Logger(MensajesService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenantService: TenantService,
    // Optional: en los tests el módulo de realtime no está, y publicar un
    // mensaje no puede depender de que el canal exista.
    @Optional() private readonly realtime?: RealtimeService,
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

    // Archivo: solo mensajes que el usuario archivó y no eliminó
    // Principal/Novedades: excluir archivados y eliminados
    const archivadoFilter = tab === 'archivo'
      ? `AND ml."archivadoEn" IS NOT NULL AND (ml."eliminadoEn" IS NULL)`
      : `AND (ml."archivadoEn" IS NULL) AND (ml."eliminadoEn" IS NULL)`;

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
        ON s."empresaId" = $2 AND s.estado IN ('activa', 'prueba')
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
        ON s."empresaId" = $2 AND s.estado IN ('activa', 'prueba')
      WHERE ${MENSAJES_ACTIVOS_WHERE}
        AND (ml."leidoEn"     IS NULL)
        AND (ml."archivadoEn" IS NULL)
        AND (ml."eliminadoEn" IS NULL)
        AND ${DESTINATARIO_FILTER}
    `, [usuarioId, empresaId]);
    return count ?? 0;
  }

  /**
   * Mensajes que el usuario no ha visto como toast todavía — de CUALQUIER tipo.
   *
   * El frontend los muestra y entonces llama a marcarVisto (ese orden importa:
   * marcarlo antes perdía mensajes si el toast no llegaba a aparecer).
   *
   * ── El tipo NO decide si se notifica ────────────────────────────────────────
   * Decide cómo se VE: el toast pinta un aviso operativo distinto de una novedad
   * de producto. Pero los dos interrumpen igual.
   *
   * Antes esto filtraba `m.tipo = 'novedad'`, y el resultado era que los
   * mensajes más urgentes eran justo los que nadie veía: los cinco mensajes que
   * existían en producción eran avisos —caídas de servicio, e-CF rechazados— y
   * ninguno llegó a notificarse nunca.
   *
   * Si algún día hace falta un tipo que no interrumpa, eso es un campo PROPIO
   * ("notificar sí/no" en el formulario de redacción), no un efecto lateral de
   * elegir un tipo u otro. Quien lo lea sin conocer la historia no puede
   * adivinar que "Aviso" significaba "no molestar".
   */
  async getMensajesNoVistos(usuarioId: number): Promise<string[]> {
    const empresaId = this.tenantService.getEmpresaId();
    const rows = await this.ds.query(`
      SELECT m.id
      FROM mensajes m
      LEFT JOIN mensajes_lectura ml
        ON ml."mensajeId" = m.id AND ml."usuarioId" = $1
      -- cast ::text obligatorio para ENUM vs varchar
      LEFT JOIN suscripciones s
        ON s."empresaId" = $2 AND s.estado IN ('activa', 'prueba')
      WHERE ${MENSAJES_ACTIVOS_WHERE}
        AND (ml."vistoEn"     IS NULL)
        AND (ml."archivadoEn" IS NULL)
        AND (ml."eliminadoEn" IS NULL)
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

  /** Quita el archivado de un mensaje (vuelve a Principal o Novedades) */
  async desarchivar(mensajeId: string, usuarioId: number): Promise<void> {
    await this.ds.query(`
      INSERT INTO mensajes_lectura ("mensajeId", "usuarioId", "archivadoEn")
      VALUES ($1, $2, NULL)
      ON CONFLICT ("mensajeId", "usuarioId")
      DO UPDATE SET "archivadoEn" = NULL
    `, [mensajeId, usuarioId]);
  }

  /** Soft-delete: ocultar mensaje de la bandeja del usuario */
  async eliminar(mensajeId: string, usuarioId: number): Promise<void> {
    await this.ds.query(`
      INSERT INTO mensajes_lectura ("mensajeId", "usuarioId", "eliminadoEn", "leidoEn")
      VALUES ($1, $2, now(), now())
      ON CONFLICT ("mensajeId", "usuarioId")
      DO UPDATE SET
        "eliminadoEn" = now(),
        "leidoEn"     = COALESCE(mensajes_lectura."leidoEn", EXCLUDED."leidoEn")
    `, [mensajeId, usuarioId]);
  }

  /** Soft-delete en lote: ocultar varios mensajes a la vez */
  async eliminarBulk(mensajeIds: string[], usuarioId: number): Promise<void> {
    if (!mensajeIds.length) return;
    const values = mensajeIds.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, now(), now())`).join(', ');
    const params = mensajeIds.flatMap(id => [id, usuarioId]);
    await this.ds.query(`
      INSERT INTO mensajes_lectura ("mensajeId", "usuarioId", "eliminadoEn", "leidoEn")
      VALUES ${values}
      ON CONFLICT ("mensajeId", "usuarioId")
      DO UPDATE SET
        "eliminadoEn" = now(),
        "leidoEn"     = COALESCE(mensajes_lectura."leidoEn", EXCLUDED."leidoEn")
    `, params);
  }

  /** Desarchiva en lote */
  async desarchivarBulk(mensajeIds: string[], usuarioId: number): Promise<void> {
    if (!mensajeIds.length) return;
    const values = mensajeIds.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, NULL)`).join(', ');
    const params = mensajeIds.flatMap(id => [id, usuarioId]);
    await this.ds.query(`
      INSERT INTO mensajes_lectura ("mensajeId", "usuarioId", "archivadoEn")
      VALUES ${values}
      ON CONFLICT ("mensajeId", "usuarioId")
      DO UPDATE SET "archivadoEn" = NULL
    `, params);
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
      LEFT JOIN suscripciones s     ON s."empresaId" = $2 AND s.estado IN ('activa', 'prueba')
      WHERE ${MENSAJES_ACTIVOS_WHERE}
        ${tipoFilter}
        AND (ml."leidoEn"     IS NULL)
        AND (ml."archivadoEn" IS NULL)
        AND (ml."eliminadoEn" IS NULL)
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

  /**
   * ¿A qué salas del canal hay que avisar de este mensaje?
   *
   * Las salas del gateway son por EMPRESA (`empresa:N`), pero los destinatarios
   * de un mensaje no siempre lo son, así que hay que traducir:
   *
   *   lista  → las empresas de destinatarioIds, tal cual
   *   plan   → hay que resolverlo: la relación empresa↔plan vive en
   *            `suscripciones`, el gateway no puede saberlo solo
   *   todas  → 'todas', que el gateway emite a todo el namespace
   *
   * Devuelve null cuando no hay a quién avisar (una lista vacía, por ejemplo).
   */
  private async empresasDestinatarias(
    destinatario: string,
    destinatarioIds?: number[] | null,
    destinatarioPlan?: string | null,
  ): Promise<number[] | 'todas' | null> {
    if (destinatario === 'todas') return 'todas';

    if (destinatario === 'lista') {
      const ids = (destinatarioIds ?? []).filter(n => Number.isFinite(n));
      return ids.length ? ids : null;
    }

    if (destinatario === 'plan' && destinatarioPlan) {
      const rows = await this.ds.query(
        `SELECT "empresaId" FROM suscripciones
         WHERE plan::text = $1 AND estado IN ('activa', 'prueba')`,
        [destinatarioPlan],
      );
      const ids = rows.map((r: any) => Number(r.empresaId)).filter((n: number) => Number.isFinite(n));
      return ids.length ? ids : null;
    }

    return null;
  }

  /**
   * Avisa por el canal en tiempo real de que hay un mensaje nuevo.
   *
   * Solo si el mensaje está VIGENTE ahora mismo: un mensaje programado para
   * mañana no tiene a quién avisar hoy —la consulta del cliente filtra
   * `fechaPublicacion <= now()` y devolvería vacío—.
   *
   * ── LOS MENSAJES PROGRAMADOS SE NOTIFICAN POR EL SONDEO ─────────────────────
   * Uno programado para las 8:00 no dispara ningún evento a esa hora: nadie lo
   * está esperando. Lo recoge el sondeo del notificador, así que puede tardar
   * HASTA 5 MINUTOS en aparecer. Es aceptable para un comunicado, pero quien lo
   * programe no debe esperar que salte al segundo.
   *
   * Si algún día molesta, lo cierra un cron que recorra los mensajes cuya
   * fechaPublicacion acaba de pasar y emita el evento entonces.
   *
   * Nunca lanza: que falle el aviso no puede tumbar la publicación del mensaje.
   */
  private async avisarMensajeNuevo(m: {
    fechaPublicacion?: string | Date | null;
    fechaExpiracion?: string | Date | null;
    activo?: boolean | null;
    destinatario: string;
    destinatarioIds?: number[] | null;
    destinatarioPlan?: string | null;
  }): Promise<void> {
    try {
      if (m.activo === false) return;

      const ahora   = Date.now();
      const publica = m.fechaPublicacion ? new Date(m.fechaPublicacion).getTime() : ahora;
      const expira  = m.fechaExpiracion  ? new Date(m.fechaExpiracion).getTime()  : null;
      if (publica > ahora) return;              // programado: lo recoge el sondeo
      if (expira !== null && expira <= ahora) return;  // ya expirado

      const destino = await this.empresasDestinatarias(
        m.destinatario, m.destinatarioIds, m.destinatarioPlan,
      );
      if (!destino) return;

      this.realtime?.notificarMensajeNuevo(destino);
    } catch (e: any) {
      this.logger?.warn(`[mensajes] no se pudo avisar por el canal: ${e?.message}`);
    }
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

    await this.avisarMensajeNuevo({
      fechaPublicacion: dto.fechaPublicacion,
      fechaExpiracion:  dto.fechaExpiracion,
      activo:           dto.activo ?? true,
      destinatario:     dto.destinatario,
      destinatarioIds:  dto.destinatarioIds,
      destinatarioPlan: dto.destinatarioPlan,
    });

    return { id };
  }

  /**
   * Permite editar un mensaje ya publicado — incluido su tipo.
   *
   * Un comunicado publicado con el tipo equivocado se corrige aquí. La
   * alternativa era borrarlo y rehacerlo, que le cambia el id, lo reordena y
   * lo devuelve a "no leído" para todo el mundo por una errata de un campo.
   *
   * Si cambia algo que el lector ve (título, cuerpo o tipo) se marca editadoEn
   * como registro de auditoría.
   */
  async adminEditar(id: string, dto: UpdateMensajeDto): Promise<void> {
    const existing = await this.ds.query(
      `SELECT id FROM mensajes WHERE id = $1`,
      [id],
    );
    if (!existing.length) throw new NotFoundException(`Mensaje ${id} no encontrado`);

    // Título, cuerpo y tipo son lo que el lector ve: cambiarlos marca editadoEn.
    // El tipo cuenta porque un aviso y una novedad no se leen igual — corregirlo
    // es una enmienda visible, no un ajuste de metadatos.
    const editaContenido =
      dto.titulo !== undefined || dto.cuerpo !== undefined || dto.tipo !== undefined;

    await this.ds.query(`
      UPDATE mensajes SET
        titulo             = COALESCE($2, titulo),
        cuerpo             = COALESCE($3, cuerpo),
        tipo               = COALESCE($4, tipo),
        destinatario       = COALESCE($5, destinatario),
        "destinatarioIds"  = COALESCE($6, "destinatarioIds"),
        "destinatarioPlan" = COALESCE($7, "destinatarioPlan"),
        "fechaPublicacion" = COALESCE($8, "fechaPublicacion"),
        "fechaExpiracion"  = COALESCE($9, "fechaExpiracion"),
        activo             = COALESCE($10, activo),
        "editadoEn"        = CASE WHEN $11 THEN now() ELSE "editadoEn" END,
        "updatedAt"        = now()
      WHERE id = $1
    `, [
      id,
      dto.titulo           ?? null,
      dto.cuerpo           ?? null,
      dto.tipo             ?? null,
      dto.destinatario     ?? null,
      dto.destinatarioIds  ?? null,
      dto.destinatarioPlan ?? null,
      dto.fechaPublicacion ?? null,
      dto.fechaExpiracion  ?? null,
      dto.activo           ?? null,
      editaContenido,
    ]);

    // Editar también publica: se puede adelantar la fechaPublicacion o
    // reactivar un mensaje apagado. Si el aviso solo saliera en adminCrear, ese
    // camino se quedaría sin notificar.
    //
    // El estado final se lee con un SELECT aparte y no con UPDATE ... RETURNING:
    // query() de TypeORM devuelve [filas, rowCount] fuera de un SELECT, y leer
    // eso como si fueran filas es el fallo que costó 40 correos repetidos a un
    // cliente. Una consulta de más a cambio de que no haya nada que interpretar.
    const [m] = await this.ds.query(
      `SELECT "fechaPublicacion", "fechaExpiracion", activo,
              destinatario, "destinatarioIds", "destinatarioPlan"
       FROM mensajes WHERE id = $1`,
      [id],
    );
    if (m) await this.avisarMensajeNuevo(m);
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
