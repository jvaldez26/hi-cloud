import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';

/**
 * Datos sensibles de menores (S-XX educativo): ningún método de este
 * service debe pasar `descripcion`/`medidaTomada`/`seguimiento` a un
 * logger, a un mensaje de excepción, ni a reportServiceError/Sentry — solo
 * ids opacos (`disciplina #${id}`). El HttpExceptionFilter global ya
 * despoja body/headers antes de reportar a Sentry (ver
 * common/observability/sentry.ts), pero este service no debe depender de
 * esa segunda línea de defensa: nunca construir un mensaje con el
 * contenido del incidente.
 */
@Injectable()
export class DisciplinaService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // ── Control de acceso por rol ────────────────────────────────────────────
  //
  // Sin precedente en el módulo (no hay rol "docente" en el sistema — ver
  // UserRole). El vínculo real es ed_docentes.usuarioId (columna existente,
  // sin consumidor hasta ahora). Si el usuario autenticado tiene un
  // ed_docentes vinculado en esta empresa, se restringe a las secciones de
  // ed_asignaciones_docente; si no (admin, dirección, contabilidad — nadie
  // vinculado como docente), ve todo. No se usa UserRole: un admin que
  // TAMBIÉN esté vinculado como docente (ej. director que da clases) cae
  // en la rama restringida a propósito — el vínculo docente es la señal,
  // no el rol.

  private async resolverDocenteId(empresaId: number, usuarioId: number): Promise<number | null> {
    const [row] = await this.ds.query<any[]>(
      `SELECT id FROM ed_docentes WHERE "empresaId" = $1 AND "usuarioId" = $2 AND "isActive" = true LIMIT 1`,
      [empresaId, usuarioId],
    );
    return row?.id ?? null;
  }

  private async seccionesDelDocente(empresaId: number, docenteId: number): Promise<number[]> {
    const rows = await this.ds.query<any[]>(
      `SELECT DISTINCT "seccionId" FROM ed_asignaciones_docente
       WHERE "empresaId" = $1 AND "docenteId" = $2 AND "isActive" = true`,
      [empresaId, docenteId],
    );
    return rows.map(r => r.seccionId);
  }

  // ── Consulta ──────────────────────────────────────────────────────────────

  async list(empresaId: number, usuarioId: number, filtros: {
    estudianteId?: number; seccionId?: number; tipo?: string; estado?: string;
  } = {}) {
    const conds: string[] = [`d."empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;

    const docenteId = await this.resolverDocenteId(empresaId, usuarioId);
    if (docenteId) {
      const secciones = await this.seccionesDelDocente(empresaId, docenteId);
      if (!secciones.length) return []; // docente sin secciones asignadas: no ve nada, no "todo"
      conds.push(`d."seccionId" = ANY($${idx})`); params.push(secciones); idx++;
    }

    if (filtros.estudianteId) { conds.push(`d."estudianteId" = $${idx}`); params.push(filtros.estudianteId); idx++; }
    if (filtros.seccionId)    { conds.push(`d."seccionId" = $${idx}`);    params.push(filtros.seccionId);    idx++; }
    if (filtros.tipo)         { conds.push(`d.tipo = $${idx}`);           params.push(filtros.tipo);         idx++; }
    if (filtros.estado)       { conds.push(`d.estado = $${idx}`);         params.push(filtros.estado);       idx++; }

    return this.ds.query<any[]>(
      `SELECT d.*,
              e.nombres || ' ' || e.apellidos AS "estudianteNombre",
              s.nombre AS "seccionNombre",
              doc.nombres || ' ' || COALESCE(doc.apellidos, '') AS "reportadoPorNombre"
       FROM ed_disciplina d
       JOIN ed_estudiantes e ON e.id = d."estudianteId"
       LEFT JOIN ed_secciones s ON s.id = d."seccionId"
       LEFT JOIN ed_docentes doc ON doc.id = d."reportadoPor"
       WHERE ${conds.join(' AND ')}
       ORDER BY d.fecha DESC, d."createdAt" DESC`,
      params,
    );
  }

  /** Historial de un estudiante para su expediente — mismo filtro de acceso que list(). */
  async expedienteEstudiante(empresaId: number, usuarioId: number, estudianteId: number) {
    return this.list(empresaId, usuarioId, { estudianteId });
  }

  private async findRow(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM ed_disciplina WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException('Incidente no encontrado');
    return row;
  }

  /** Lanza ForbiddenException si el usuario es docente y la sección del incidente no es suya. */
  private async verificarAcceso(empresaId: number, usuarioId: number, seccionId: number | null) {
    const docenteId = await this.resolverDocenteId(empresaId, usuarioId);
    if (!docenteId) return; // no vinculado como docente: acceso completo
    if (!seccionId) throw new ForbiddenException('No tienes acceso a este incidente');
    const secciones = await this.seccionesDelDocente(empresaId, docenteId);
    if (!secciones.includes(seccionId)) throw new ForbiddenException('No tienes acceso a este incidente');
  }

  // ── Escritura ─────────────────────────────────────────────────────────────

  async create(empresaId: number, usuarioId: number, dto: any) {
    const [est] = await this.ds.query<any[]>(
      `SELECT id FROM ed_estudiantes WHERE id = $1 AND "empresaId" = $2`,
      [dto.estudianteId, empresaId],
    );
    if (!est) throw new NotFoundException('Estudiante no encontrado');

    if (dto.seccionId) {
      const [sec] = await this.ds.query<any[]>(
        `SELECT id FROM ed_secciones WHERE id = $1 AND "empresaId" = $2`,
        [dto.seccionId, empresaId],
      );
      if (!sec) throw new NotFoundException('Sección no encontrada');
    }

    // Un docente solo puede reportar incidentes de sus propias secciones.
    const docenteId = await this.resolverDocenteId(empresaId, usuarioId);
    if (docenteId && dto.seccionId) {
      const secciones = await this.seccionesDelDocente(empresaId, docenteId);
      if (!secciones.includes(dto.seccionId)) {
        throw new ForbiddenException('No puedes reportar incidentes de una sección que no es tuya');
      }
    }

    const reportadoPor = dto.reportadoPor ?? docenteId ?? null;

    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_disciplina (
         "empresaId","estudianteId","seccionId",fecha,tipo,categoria,descripcion,
         "medidaTomada","reportadoPor",seguimiento,estado
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'abierto') RETURNING *`,
      [
        empresaId, dto.estudianteId, dto.seccionId ?? null,
        dto.fecha ?? fechaHoyRD(), dto.tipo, dto.categoria ?? null, dto.descripcion,
        dto.medidaTomada ?? null, reportadoPor, dto.seguimiento ?? null,
      ],
    );
    return row;
  }

  async update(empresaId: number, usuarioId: number, id: number, dto: any) {
    const existing = await this.findRow(empresaId, id);
    await this.verificarAcceso(empresaId, usuarioId, existing.seccionId ?? null);

    if (dto.seccionId) {
      const [sec] = await this.ds.query<any[]>(
        `SELECT id FROM ed_secciones WHERE id = $1 AND "empresaId" = $2`,
        [dto.seccionId, empresaId],
      );
      if (!sec) throw new NotFoundException('Sección no encontrada');
    }

    const FIELDS = ['fecha', 'seccionId', 'tipo', 'categoria', 'descripcion', 'medidaTomada', 'seguimiento', 'estado'];
    const fields = FIELDS.filter(f => dto[f] !== undefined);
    if (!fields.length) return existing;
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE ed_disciplina SET ${sets} WHERE id = $1 AND "empresaId" = $2 RETURNING *
       ) SELECT * FROM fila`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    return row;
  }

  async notificarPadres(empresaId: number, usuarioId: number, id: number) {
    const existing = await this.findRow(empresaId, id);
    await this.verificarAcceso(empresaId, usuarioId, existing.seccionId ?? null);

    const [row] = await this.ds.query<any[]>(
      `WITH fila AS (
         UPDATE ed_disciplina
           SET "padresNotificados" = true, "fechaNotificacion" = NOW()
           WHERE id = $1 AND "empresaId" = $2 RETURNING *
       ) SELECT * FROM fila`,
      [id, empresaId],
    );
    return row;
  }
}
