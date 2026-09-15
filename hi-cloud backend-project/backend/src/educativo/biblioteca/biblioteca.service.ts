import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { fechaHoyRD } from '../../common/utils/fecha-local.util';

@Injectable()
export class BibliotecaService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // ── Libros ──────────────────────────────────────────────────────────────

  async listLibros(empresaId: number, opts: { q?: string; isActive?: boolean } = {}) {
    const conds: string[] = [`"empresaId" = $1`];
    const params: any[] = [empresaId];
    let idx = 2;
    if (opts.isActive !== undefined) { conds.push(`"isActive" = $${idx}`); params.push(opts.isActive); idx++; }
    if (opts.q) {
      conds.push(`(titulo ILIKE $${idx} OR autor ILIKE $${idx} OR isbn ILIKE $${idx} OR codigo ILIKE $${idx})`);
      params.push(`%${opts.q}%`); idx++;
    }
    return this.ds.query<any[]>(
      `SELECT * FROM ed_biblioteca_libros WHERE ${conds.join(' AND ')} ORDER BY titulo`,
      params,
    );
  }

  async createLibro(empresaId: number, dto: any) {
    const [row] = await this.ds.query<any[]>(
      `INSERT INTO ed_biblioteca_libros (
         "empresaId", codigo, isbn, titulo, autor, editorial, categoria,
         "cantidadTotal", "cantidadDisponible", ubicacion
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9) RETURNING *`,
      [
        empresaId, dto.codigo ?? null, dto.isbn ?? null, dto.titulo,
        dto.autor ?? null, dto.editorial ?? null, dto.categoria ?? null,
        dto.cantidadTotal, dto.ubicacion ?? null,
      ],
    );
    return row;
  }

  /**
   * Si cantidadTotal cambia, cantidadDisponible se ajusta por la DIFERENCIA
   * (nunca se pisa con el valor nuevo) — si hay 2 de 5 prestados
   * (disponible=3) y el bibliotecario sube el total a 6, disponible pasa a
   * 4, no a 6. Bajo lock: un préstamo/devolución concurrente sobre el mismo
   * libro espera a que esta actualización termine.
   */
  async updateLibro(empresaId: number, id: number, dto: any) {
    return this.ds.transaction(async (manager) => {
      const [libro] = await manager.query<any[]>(
        `SELECT * FROM ed_biblioteca_libros WHERE id = $1 AND "empresaId" = $2 FOR UPDATE`,
        [id, empresaId],
      );
      if (!libro) throw new NotFoundException('Libro no encontrado');

      // Valores a escribir por campo — se arma primero como mapa (no como
      // dos arreglos paralelos) para que "cantidadDisponible" (derivada,
      // nunca viene del DTO) entre una sola vez, sin duplicar el cálculo.
      const valores: Record<string, any> = {};
      for (const f of ['codigo', 'isbn', 'titulo', 'autor', 'editorial', 'categoria', 'ubicacion', 'isActive']) {
        if (dto[f] !== undefined) valores[f] = dto[f];
      }
      if (dto.cantidadTotal !== undefined) {
        const nuevoTotal = Number(dto.cantidadTotal);
        const delta = nuevoTotal - Number(libro.cantidadTotal);
        const nuevaDisponible = Math.max(Number(libro.cantidadDisponible) + delta, 0);
        if (nuevaDisponible > nuevoTotal) {
          throw new BadRequestException('La cantidad disponible no puede superar el nuevo total');
        }
        valores.cantidadTotal = nuevoTotal;
        valores.cantidadDisponible = nuevaDisponible;
      }

      const campos = Object.keys(valores);
      if (!campos.length) return libro;

      const sets = campos.map((f, i) => `"${f}" = $${i + 3}`);
      const [row] = await manager.query(
        `WITH fila AS (
           UPDATE ed_biblioteca_libros SET ${sets.join(', ')} WHERE id = $1 AND "empresaId" = $2 RETURNING *
         ) SELECT * FROM fila`,
        [id, empresaId, ...campos.map(f => valores[f])],
      );
      return row;
    });
  }

  // ── Préstamos ───────────────────────────────────────────────────────────

  /**
   * 'prestado'|'devuelto' se guardan; 'vencido' se deriva al leer — nunca
   * se escribe. `hoy` SIEMPRE va como parámetro ligado (nunca interpolado
   * en el texto del SQL, aunque venga de fechaHoyRD() y no de un usuario —
   * mismo hábito que el resto del módulo).
   */
  private static readonly ESTADO_DERIVADO_EXPR =
    `CASE WHEN p.estado = 'devuelto' THEN 'devuelto'
          WHEN p."fechaVencimiento" < $HOY THEN 'vencido'
          ELSE 'prestado' END`;

  async listPrestamos(empresaId: number, opts: {
    libroId?: number; estudianteId?: number; docenteId?: number; estado?: string;
  } = {}) {
    const conds: string[] = [`p."empresaId" = $1`];
    const params: any[] = [empresaId, fechaHoyRD()]; // $2 = hoy, ver ESTADO_DERIVADO_EXPR
    let idx = 3;
    if (opts.libroId)      { conds.push(`p."libroId" = $${idx}`);      params.push(opts.libroId);      idx++; }
    if (opts.estudianteId) { conds.push(`p."estudianteId" = $${idx}`); params.push(opts.estudianteId); idx++; }
    if (opts.docenteId)    { conds.push(`p."docenteId" = $${idx}`);    params.push(opts.docenteId);    idx++; }

    const estadoExpr = BibliotecaService.ESTADO_DERIVADO_EXPR.replace('$HOY', '$2');
    if (opts.estado) { conds.push(`(${estadoExpr}) = $${idx}`); params.push(opts.estado); idx++; }

    return this.ds.query<any[]>(
      `SELECT p.*, ${estadoExpr} AS "estadoDerivado",
              l.titulo AS "libroTitulo", l.codigo AS "libroCodigo",
              e.nombres || ' ' || e.apellidos AS "estudianteNombre",
              d.nombres || ' ' || COALESCE(d.apellidos, '') AS "docenteNombre"
       FROM ed_biblioteca_prestamos p
       JOIN ed_biblioteca_libros l ON l.id = p."libroId"
       LEFT JOIN ed_estudiantes e ON e.id = p."estudianteId"
       LEFT JOIN ed_docentes d ON d.id = p."docenteId"
       WHERE ${conds.join(' AND ')}
       ORDER BY p."fechaVencimiento" ASC, p."createdAt" DESC`,
      params,
    );
  }

  /** Lo que el bibliotecario revisa a diario. */
  async listVencidos(empresaId: number) {
    return this.listPrestamos(empresaId, { estado: 'vencido' });
  }

  async prestar(empresaId: number, dto: any) {
    if (!!dto.estudianteId === !!dto.docenteId) {
      throw new BadRequestException('El préstamo debe ser a un estudiante o a un docente, no a ambos ni a ninguno');
    }

    return this.ds.transaction(async (manager) => {
      const [libro] = await manager.query<any[]>(
        `SELECT * FROM ed_biblioteca_libros WHERE id = $1 AND "empresaId" = $2 FOR UPDATE`,
        [dto.libroId, empresaId],
      );
      if (!libro) throw new NotFoundException('Libro no encontrado');
      if (!libro.isActive) throw new BadRequestException('Este libro no está activo en el catálogo');
      if (Number(libro.cantidadDisponible) <= 0) {
        throw new BadRequestException('No hay ejemplares disponibles de este libro');
      }

      if (dto.estudianteId) {
        const [est] = await manager.query<any[]>(
          `SELECT id FROM ed_estudiantes WHERE id = $1 AND "empresaId" = $2`,
          [dto.estudianteId, empresaId],
        );
        if (!est) throw new NotFoundException('Estudiante no encontrado');
      } else {
        const [doc] = await manager.query<any[]>(
          `SELECT id FROM ed_docentes WHERE id = $1 AND "empresaId" = $2`,
          [dto.docenteId, empresaId],
        );
        if (!doc) throw new NotFoundException('Docente no encontrado');
      }

      const [prestamo] = await manager.query<any[]>(
        `INSERT INTO ed_biblioteca_prestamos (
           "empresaId","libroId","estudianteId","docenteId","fechaPrestamo","fechaVencimiento",estado
         ) VALUES ($1,$2,$3,$4,$5,$6,'prestado') RETURNING *`,
        [empresaId, dto.libroId, dto.estudianteId ?? null, dto.docenteId ?? null, fechaHoyRD(), dto.fechaVencimiento],
      );

      await manager.query(
        `UPDATE ed_biblioteca_libros SET "cantidadDisponible" = "cantidadDisponible" - 1 WHERE id = $1`,
        [libro.id],
      );

      return prestamo;
    });
  }

  async devolver(empresaId: number, id: number) {
    return this.ds.transaction(async (manager) => {
      const [prestamo] = await manager.query<any[]>(
        `SELECT * FROM ed_biblioteca_prestamos WHERE id = $1 AND "empresaId" = $2 FOR UPDATE`,
        [id, empresaId],
      );
      if (!prestamo) throw new NotFoundException('Préstamo no encontrado');
      if (prestamo.estado === 'devuelto') throw new BadRequestException('Este préstamo ya fue devuelto');

      const [row] = await manager.query<any[]>(
        `WITH fila AS (
           UPDATE ed_biblioteca_prestamos
             SET estado = 'devuelto', "fechaDevolucion" = $1
             WHERE id = $2 AND "empresaId" = $3 RETURNING *
         ) SELECT * FROM fila`,
        [fechaHoyRD(), id, empresaId],
      );

      // Lock también sobre el libro — una devolución y un préstamo
      // concurrentes del mismo libro no deben pisarse el contador.
      await manager.query(`SELECT id FROM ed_biblioteca_libros WHERE id = $1 FOR UPDATE`, [prestamo.libroId]);
      await manager.query(
        `UPDATE ed_biblioteca_libros
           SET "cantidadDisponible" = LEAST("cantidadDisponible" + 1, "cantidadTotal")
           WHERE id = $1`,
        [prestamo.libroId],
      );

      return row;
    });
  }
}
