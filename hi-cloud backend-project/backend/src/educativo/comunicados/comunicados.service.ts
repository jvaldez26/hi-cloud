import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const CAMPO_POR_DESTINATARIO: Record<string, string> = {
  grado: 'gradoId', seccion: 'seccionId', individual: 'estudianteId',
};

@Injectable()
export class ComunicadosService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async list(empresaId: number, opts: { destinatarioTipo?: string; gradoId?: number; seccionId?: number } = {}) {
    const conds = [`c."empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (opts.destinatarioTipo) { conds.push(`c."destinatarioTipo" = $${idx}`); params.push(opts.destinatarioTipo); idx++; }
    if (opts.gradoId)          { conds.push(`c."gradoId" = $${idx}`);          params.push(opts.gradoId);          idx++; }
    if (opts.seccionId)        { conds.push(`c."seccionId" = $${idx}`);        params.push(opts.seccionId);        idx++; }

    return this.ds.query<any[]>(
      `SELECT c.*,
              g.nombre AS "gradoNombre",
              s.nombre AS "seccionNombre",
              e.nombres || ' ' || e.apellidos AS "estudianteNombre"
       FROM ed_comunicados c
       LEFT JOIN ed_grados g ON g.id = c."gradoId"
       LEFT JOIN ed_secciones s ON s.id = c."seccionId"
       LEFT JOIN ed_estudiantes e ON e.id = c."estudianteId"
       WHERE ${conds.join(' AND ')}
       ORDER BY c."fechaEnvio" DESC`,
      params,
    );
  }

  private async validarDestinatario(empresaId: number, dto: any) {
    const campoRequerido = CAMPO_POR_DESTINATARIO[dto.destinatarioTipo];
    if (!campoRequerido) return; // 'todos' no requiere ningún id

    if (dto[campoRequerido] == null) {
      throw new BadRequestException(`El destinatario "${dto.destinatarioTipo}" requiere ${campoRequerido}`);
    }

    // safeTable: nunca viene del usuario — sale de un ternario fijo de 3
    // literales según destinatarioTipo, que ya pasó @IsIn(DESTINATARIO_TIPOS).
    const safeTable = dto.destinatarioTipo === 'grado' ? 'ed_grados'
                     : dto.destinatarioTipo === 'seccion' ? 'ed_secciones'
                     : 'ed_estudiantes';
    const [row] = await this.ds.query<any[]>(
      `SELECT id FROM ${safeTable} WHERE id = $1 AND "empresaId" = $2`,
      [dto[campoRequerido], empresaId],
    );
    if (!row) throw new NotFoundException(`${campoRequerido === 'gradoId' ? 'Grado' : campoRequerido === 'seccionId' ? 'Sección' : 'Estudiante'} no encontrado`);
  }

  async create(empresaId: number, creadoPor: string, dto: any) {
    await this.validarDestinatario(empresaId, dto);

    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_comunicados (
         "empresaId", titulo, contenido, tipo, "destinatarioTipo",
         "gradoId", "seccionId", "estudianteId", "enviarWhatsapp", "enviarEmail", "creadoPor"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        empresaId, dto.titulo, dto.contenido, dto.tipo ?? null, dto.destinatarioTipo,
        dto.destinatarioTipo === 'grado' ? dto.gradoId : null,
        dto.destinatarioTipo === 'seccion' ? dto.seccionId : null,
        dto.destinatarioTipo === 'individual' ? dto.estudianteId : null,
        dto.enviarWhatsapp ?? false, dto.enviarEmail ?? false, creadoPor,
      ],
    );
    return row;
  }

  async update(empresaId: number, id: number, dto: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT * FROM ed_comunicados WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!exists) throw new NotFoundException('Comunicado no encontrado');

    if (dto.destinatarioTipo) {
      await this.validarDestinatario(empresaId, {
        destinatarioTipo: dto.destinatarioTipo,
        gradoId:      dto.gradoId      ?? exists.gradoId,
        seccionId:    dto.seccionId    ?? exists.seccionId,
        estudianteId: dto.estudianteId ?? exists.estudianteId,
      });
    }

    const FIELDS = ['titulo', 'contenido', 'tipo', 'destinatarioTipo', 'gradoId', 'seccionId', 'estudianteId', 'enviarWhatsapp', 'enviarEmail'];
    const fields = FIELDS.filter(f => dto[f] !== undefined);
    if (!fields.length) return exists;
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE ed_comunicados SET ${sets} WHERE id = $1 AND "empresaId" = $2 RETURNING *
       ) SELECT * FROM fila`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    return row;
  }
}
