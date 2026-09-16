import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CargosServicioService } from '../common/cargos-servicio.service';

@Injectable()
export class TransporteService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cargosSvc: CargosServicioService,
  ) {}

  // ── Rutas ───────────────────────────────────────────────────────────────

  async listRutas(empresaId: number, opts: { isActive?: boolean } = {}) {
    const conds = [`r."empresaId" = $1`];
    const params: any[] = [empresaId];
    if (opts.isActive !== undefined) { conds.push(`r."isActive" = $2`); params.push(opts.isActive); }
    return this.ds.query<any[]>(
      `SELECT r.*,
              (SELECT COUNT(*) FROM ed_transporte_estudiantes e WHERE e."rutaId" = r.id AND e."isActive" = true)::int AS "ocupacionActual"
       FROM ed_transporte_rutas r
       WHERE ${conds.join(' AND ')}
       ORDER BY r.nombre`,
      params,
    );
  }

  async createRuta(empresaId: number, dto: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_transporte_rutas (
         "empresaId", nombre, descripcion, chofer, "choferTelefono", "vehiculoPlaca",
         capacidad, "costoMensual", paradas
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        empresaId, dto.nombre, dto.descripcion ?? null, dto.chofer ?? null,
        dto.choferTelefono ?? null, dto.vehiculoPlaca ?? null,
        dto.capacidad ?? null, dto.costoMensual ?? null,
        dto.paradas ? JSON.stringify(dto.paradas) : null,
      ],
    );
    return row;
  }

  async updateRuta(empresaId: number, id: number, dto: any) {
    const [exists] = await this.ds.query<any[]>(
      `SELECT id FROM ed_transporte_rutas WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!exists) throw new NotFoundException('Ruta no encontrada');

    const FIELDS = ['nombre', 'descripcion', 'chofer', 'choferTelefono', 'vehiculoPlaca', 'capacidad', 'costoMensual', 'isActive'];
    const fields = FIELDS.filter(f => dto[f] !== undefined);
    const valores: any[] = fields.map(f => dto[f]);
    if (dto.paradas !== undefined) { fields.push('paradas'); valores.push(JSON.stringify(dto.paradas)); }
    if (!fields.length) return exists;

    const sets = fields.map((f, i) => `"${f}" = $${i + 3}`);
    const [row] = await this.ds.query(
      `WITH fila AS (
         UPDATE ed_transporte_rutas SET ${sets.join(', ')} WHERE id = $1 AND "empresaId" = $2 RETURNING *
       ) SELECT * FROM fila`,
      [id, empresaId, ...valores],
    );
    return row;
  }

  // ── Asignación de estudiantes ──────────────────────────────────────────

  async listAsignaciones(empresaId: number, opts: { rutaId?: number; estudianteId?: number } = {}) {
    const conds = [`a."empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (opts.rutaId)      { conds.push(`a."rutaId" = $${idx}`);      params.push(opts.rutaId);      idx++; }
    if (opts.estudianteId) { conds.push(`a."estudianteId" = $${idx}`); params.push(opts.estudianteId); idx++; }
    return this.ds.query<any[]>(
      `SELECT a.*,
              r.nombre AS "rutaNombre",
              e.nombres || ' ' || e.apellidos AS "estudianteNombre"
       FROM ed_transporte_estudiantes a
       JOIN ed_transporte_rutas r ON r.id = a."rutaId"
       JOIN ed_estudiantes e ON e.id = a."estudianteId"
       WHERE ${conds.join(' AND ')}
       ORDER BY a."isActive" DESC, e.apellidos`,
      params,
    );
  }

  /**
   * Identificador embebido en ed_cargos.concepto para poder cancelar
   * después los cargos de ESTA asignación puntual (sin columna dedicada —
   * ed_cargos no tiene rutaId/asignacionTransporteId, y no hace falta
   * migración: concepto es VARCHAR(200) libre, mismo campo que colegiatura
   * usa para su propia trazabilidad de descuentos).
   */
  private conceptoTransporte(rutaId: number, asignacionId: number) {
    return `transporte:ruta=${rutaId};asignacion=${asignacionId}`;
  }

  async asignarEstudiante(empresaId: number, dto: any) {
    const est = await this.ds.query<any[]>(
      `SELECT id FROM ed_estudiantes WHERE id = $1 AND "empresaId" = $2`,
      [dto.estudianteId, empresaId],
    );
    if (!est.length) throw new NotFoundException('Estudiante no encontrado');

    // Lock sobre la ruta — mismo motivo que el lock de biblioteca sobre el
    // libro: dos asignaciones concurrentes a una ruta casi en su
    // capacidad máxima no deben poder pasar las dos el conteo antes de
    // que la otra inserte.
    const { asignacion, ruta } = await this.ds.transaction(async (manager) => {
      const [ruta] = await manager.query<any[]>(
        `SELECT * FROM ed_transporte_rutas WHERE id = $1 AND "empresaId" = $2 FOR UPDATE`,
        [dto.rutaId, empresaId],
      );
      if (!ruta) throw new NotFoundException('Ruta no encontrada');
      if (!ruta.isActive) throw new BadRequestException('Esta ruta no está activa');

      const [yaAsignado] = await manager.query<any[]>(
        `SELECT id, "rutaId" FROM ed_transporte_estudiantes
         WHERE "empresaId" = $1 AND "estudianteId" = $2 AND "isActive" = true`,
        [empresaId, dto.estudianteId],
      );
      if (yaAsignado) {
        throw new BadRequestException(
          yaAsignado.rutaId === dto.rutaId
            ? 'El estudiante ya está asignado a esta ruta'
            : 'El estudiante ya tiene una ruta de transporte activa — desasígnalo primero',
        );
      }

      if (ruta.capacidad != null) {
        const [{ count }] = await manager.query<any[]>(
          `SELECT COUNT(*)::int AS count FROM ed_transporte_estudiantes WHERE "rutaId" = $1 AND "isActive" = true`,
          [dto.rutaId],
        );
        if (Number(count) >= Number(ruta.capacidad)) {
          throw new BadRequestException(`La ruta "${ruta.nombre}" ya está a su capacidad máxima (${ruta.capacidad})`);
        }
      }

      const [asignacion] = await manager.query<any[]>(
        `INSERT INTO ed_transporte_estudiantes (
           "empresaId","rutaId","estudianteId","paradaRecogida","costoMensual","isActive"
         ) VALUES ($1,$2,$3,$4,$5,true) RETURNING *`,
        [empresaId, dto.rutaId, dto.estudianteId, dto.paradaRecogida ?? null, dto.costoMensual ?? ruta.costoMensual ?? null],
      );
      return { asignacion, ruta };
    });

    const resultado = await this.cargosSvc.generarCargos(empresaId, {
      estudianteId: asignacion.estudianteId,
      tipo: 'transporte',
      concepto: this.conceptoTransporte(asignacion.rutaId, asignacion.id),
      costoMensual: asignacion.costoMensual ?? ruta.costoMensual,
      descripcionPrefijo: 'Transporte',
    });
    return { asignacion, ...resultado };
  }

  /**
   * Baja de la asignación: se desactiva y se anulan sus cargos futuros sin
   * pagar (ver CargosServicioService.anularCargosFuturosSinPagar).
   */
  async desasignarEstudiante(empresaId: number, id: number) {
    const [asignacion] = await this.ds.query<any[]>(
      `SELECT * FROM ed_transporte_estudiantes WHERE id = $1 AND "empresaId" = $2`,
      [id, empresaId],
    );
    if (!asignacion) throw new NotFoundException('Asignación no encontrada');
    if (!asignacion.isActive) throw new BadRequestException('Esta asignación ya está inactiva');

    const [row] = await this.ds.query<any[]>(
      `WITH fila AS (
         UPDATE ed_transporte_estudiantes SET "isActive" = false WHERE id = $1 AND "empresaId" = $2 RETURNING *
       ) SELECT * FROM fila`,
      [id, empresaId],
    );

    const { cargosAnulados } = await this.cargosSvc.anularCargosFuturosSinPagar(empresaId, {
      estudianteId: asignacion.estudianteId,
      tipo: 'transporte',
      concepto: this.conceptoTransporte(asignacion.rutaId, asignacion.id),
    });

    return { asignacion: row, cargosAnulados };
  }
}
