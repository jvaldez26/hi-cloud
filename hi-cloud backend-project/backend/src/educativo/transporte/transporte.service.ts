import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';
import { redondearMoneda } from '../../common/utils/moneda.util';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

@Injectable()
export class TransporteService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

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

  /**
   * Meses a cobrar: desde el mes en curso (o el mes de inicio del año
   * escolar, lo que sea más tarde) hasta el fin del año escolar activo —
   * "el resto del año", nunca retroactivo a meses ya pasados antes de la
   * asignación.
   *
   * TODO en SQL a propósito: `DataSource.query()` devuelve las columnas
   * `date` (fechaInicio/fechaFin) como objetos `Date` de JS, construidos
   * en la zona horaria LOCAL del proceso (no un string 'YYYY-MM-DD') — un
   * `.split('-')` sobre ese valor revienta en silencio y generarCargos
   * queda en 0 sin que nadie se entere (encontrado con Playwright: la
   * asignación se creaba, cero cargos). generate_series trabaja sobre el
   * `date` nativo de Postgres, sin esa ambigüedad — es el mismo motivo por
   * el que el resto del módulo (ver listCargos de colegiatura,
   * "fechaVencimiento" < CURRENT_DATE) nunca hace aritmética de fechas en
   * JS sobre una columna leída de la BD.
   */
  private async mesesRestantes(empresaId: number, anioEscolarId: number, hoy: string): Promise<{ mes: number; anio: number }[]> {
    const rows = await this.ds.query<any[]>(
      `SELECT EXTRACT(MONTH FROM d)::int AS mes, EXTRACT(YEAR FROM d)::int AS anio
       FROM ed_anios_escolares a,
            LATERAL generate_series(
              GREATEST(date_trunc('month', a."fechaInicio"), date_trunc('month', $3::date)),
              a."fechaFin",
              '1 month'::interval
            ) AS d
       WHERE a.id = $1 AND a."empresaId" = $2`,
      [anioEscolarId, empresaId, hoy],
    );
    return rows;
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

    const resultado = await this.generarCargosTransporte(empresaId, asignacion, ruta);
    return { asignacion, ...resultado };
  }

  /**
   * Genera los cargos de transporte pendientes de la asignación, del mes
   * en curso hasta el fin del año escolar activo — MISMO motor que
   * colegiatura (ed_cargos, montoOriginal/descuento/montoTotal/
   * montoPagado/saldoPendiente), sin un segundo camino de deuda.
   *
   * Las becas NO se consultan aquí: ed_becas.aplicaA solo acepta
   * 'colegiatura'|'inscripcion'|'ambos' hoy — transporte no está
   * contemplado, así que descuento siempre queda en 0 (confirmado en el
   * código, no asumido).
   */
  private async generarCargosTransporte(empresaId: number, asignacion: any, ruta: any) {
    const costoMensual = Number(asignacion.costoMensual ?? ruta.costoMensual ?? 0);
    if (!(costoMensual > 0)) {
      return { cargosGenerados: 0, motivo: 'La ruta no tiene costo mensual configurado — no se generaron cargos' };
    }

    const [anioEscolar] = await this.ds.query<any[]>(
      `SELECT * FROM ed_anios_escolares WHERE "empresaId" = $1 AND "esActual" = true LIMIT 1`,
      [empresaId],
    );
    if (!anioEscolar) {
      return { cargosGenerados: 0, motivo: 'No hay un año escolar activo configurado — no se generaron cargos' };
    }

    const hoy = fechaHoyRD();
    const meses = await this.mesesRestantes(empresaId, anioEscolar.id, hoy);
    const concepto = this.conceptoTransporte(asignacion.rutaId, asignacion.id);
    const monto = redondearMoneda(costoMensual);

    let creados = 0;
    for (const { mes, anio } of meses) {
      const [existe] = await this.ds.query<any[]>(
        `SELECT id FROM ed_cargos WHERE "empresaId" = $1 AND "estudianteId" = $2 AND tipo = 'transporte' AND mes = $3 AND anio = $4`,
        [empresaId, asignacion.estudianteId, mes, anio],
      );
      if (existe) continue;

      const vencimiento = `${anio}-${String(mes).padStart(2, '0')}-05`;
      await this.ds.query(
        `INSERT INTO ed_cargos (
           "empresaId","estudianteId",tipo,descripcion,concepto,
           "montoOriginal",descuento,"montoTotal","montoPagado","saldoPendiente",
           "fechaVencimiento",estado,mes,anio
         ) VALUES ($1,$2,'transporte',$3,$4,$5,0,$5,0,$5,$6,'pendiente',$7,$8)`,
        [empresaId, asignacion.estudianteId, `Transporte ${MESES[mes - 1]} ${anio}`, concepto, monto, vencimiento, mes, anio],
      );
      creados++;
    }
    return { cargosGenerados: creados };
  }

  /**
   * Baja de la asignación: se desactiva, y se anulan los cargos de
   * transporte FUTUROS (fechaVencimiento >= hoy) que sigan sin ningún
   * pago encima (montoPagado = 0) — un cargo ya vencido (el servicio ya
   * se prestó) o con algo abonado NUNCA se anula, se queda como está.
   * Sin precedente en el módulo (matriculas.update() a estado='retirada'
   * no toca ed_cargos) — decisión explícita de esta implementación.
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

    const concepto = this.conceptoTransporte(asignacion.rutaId, asignacion.id);
    const hoy = fechaHoyRD();
    const cancelados = await this.ds.query<any[]>(
      `WITH filas AS (
         UPDATE ed_cargos
           SET estado = 'anulado'
           WHERE "empresaId" = $1 AND "estudianteId" = $2 AND tipo = 'transporte' AND concepto = $3
             AND "montoPagado" = 0 AND "fechaVencimiento" >= $4 AND estado != 'anulado'
           RETURNING id
       ) SELECT COUNT(*)::int AS n FROM filas`,
      [empresaId, asignacion.estudianteId, concepto, hoy],
    );

    return { asignacion: row, cargosAnulados: cancelados[0]?.n ?? 0 };
  }
}
