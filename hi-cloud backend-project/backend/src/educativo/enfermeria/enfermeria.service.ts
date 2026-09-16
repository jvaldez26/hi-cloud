import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Datos médicos de menores — el módulo más delicado del sistema.
 * Control de acceso: @Roles(UserRole.ADMIN) en el controller (no hay rol
 * "enfermería"/"dirección" propio hoy — comparten la cuenta admin; ver
 * feedback_educativo_enfermeria_acceso en memoria). Un docente jamás llega
 * a estos métodos porque el guard lo bloquea antes.
 *
 * Ningún método de este service debe pasar `motivo`/`sintomas`/
 * `atencionBrindada`/`medicamentoDado` a un logger, a un mensaje de
 * excepción, ni a Sentry — solo el id numérico del registro
 * (`enfermería #${id}`). No hay exportación a Excel de este módulo — no
 * agregar una.
 */
@Injectable()
export class EnfermeriaService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async list(empresaId: number, filtros: { estudianteId?: number } = {}) {
    const conds = [`v."empresaId" = $1`];
    const params: any[] = [empresaId];
    if (filtros.estudianteId) { conds.push(`v."estudianteId" = $2`); params.push(filtros.estudianteId); }

    return this.ds.query<any[]>(
      `SELECT v.*, e.nombres || ' ' || e.apellidos AS "estudianteNombre"
       FROM ed_enfermeria v
       JOIN ed_estudiantes e ON e.id = v."estudianteId"
       WHERE ${conds.join(' AND ')}
       ORDER BY v.fecha DESC`,
      params,
    );
  }

  /** Historial de un estudiante para su expediente (pestaña Salud, solo admin). */
  async expedienteEstudiante(empresaId: number, estudianteId: number) {
    return this.list(empresaId, { estudianteId });
  }

  /**
   * Contexto médico del estudiante (alergias, condiciones, tipo de sangre)
   * para mostrar a quien atiende al registrar una visita — ya vive en
   * ed_estudiantes, no se duplica aquí.
   */
  async contextoMedico(empresaId: number, estudianteId: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT id, nombres, apellidos, "tipoSangre", alergias, "condicionesMedicas",
              "medicoTelefono", "seguroMedico"
       FROM ed_estudiantes WHERE id = $1 AND "empresaId" = $2`,
      [estudianteId, empresaId],
    );
    if (!row) throw new NotFoundException('Estudiante no encontrado');
    return row;
  }

  private async findRow(empresaId: number, id: number) {
    const [row] = await this.ds.query<any[]>(
      `SELECT * FROM ed_enfermeria WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!row) throw new NotFoundException(`Registro de enfermería no encontrado (#${id})`);
    return row;
  }

  async create(empresaId: number, dto: any) {
    const [est] = await this.ds.query<any[]>(
      `SELECT id FROM ed_estudiantes WHERE id = $1 AND "empresaId" = $2`,
      [dto.estudianteId, empresaId],
    );
    if (!est) throw new NotFoundException('Estudiante no encontrado');

    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_enfermeria (
         "empresaId","estudianteId",fecha,motivo,sintomas,"atencionBrindada",
         "medicamentoDado","padresNotificados","enviadoCasa","atendidoPor"
       ) VALUES ($1,$2,COALESCE($3, NOW()),$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        empresaId, dto.estudianteId, dto.fecha ?? null, dto.motivo,
        dto.sintomas ?? null, dto.atencionBrindada ?? null, dto.medicamentoDado ?? null,
        dto.padresNotificados ?? false, dto.enviadoCasa ?? false, dto.atendidoPor ?? null,
      ],
    );
    return row;
  }

  async update(empresaId: number, id: number, dto: any) {
    await this.findRow(empresaId, id);

    const FIELDS = ['motivo', 'sintomas', 'atencionBrindada', 'medicamentoDado', 'padresNotificados', 'enviadoCasa', 'atendidoPor'];
    const fields = FIELDS.filter(f => dto[f] !== undefined);
    if (!fields.length) return this.findRow(empresaId, id);
    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`).join(', ');
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE ed_enfermeria SET ${sets} WHERE id = $1 AND "empresaId" = $2 RETURNING *
       ) SELECT * FROM fila`,
      [id, empresaId, ...fields.map(f => dto[f])],
    );
    return row;
  }
}
