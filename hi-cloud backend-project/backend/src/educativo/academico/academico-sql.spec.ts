import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { AcademicoService } from './academico.service';
import { assertPeriodoAbierto } from '../common/periodo.util';

/**
 * Contrato: academico.service.ts debe usar las columnas reales de
 * ed_evaluaciones (puntajeMaximo, ponderacion, estado — no valorMaximo,
 * porcentaje, isActive) y de ed_asistencia (justificacion — no
 * observaciones), y el ON CONFLICT de bulkAsistencia() debe apuntar al
 * UNIQUE real ("estudianteId", fecha, "asignaturaId"), no a
 * ("estudianteId","seccionId",fecha), que no es ninguna constraint (42P10).
 */
describe('SQL crudo de academico.service.ts', () => {
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');
  const src = () => leer('academico.service.ts');
  const bloque = (inicio: string, fin: string) => {
    const s = src();
    return s.slice(s.indexOf(inicio), s.indexOf(fin));
  };

  it('createEvaluacion() usa puntajeMaximo/ponderacion, no valorMaximo/porcentaje', () => {
    const b = bloque('async createEvaluacion(', 'async updateEvaluacion(');
    expect(b).toContain('"puntajeMaximo"');
    expect(b).toContain('ponderacion');
    expect(b).not.toContain('valorMaximo');
    expect(b).not.toContain('dto.porcentaje');
  });

  it('updateEvaluacion() (FIELDS) usa puntajeMaximo/ponderacion/estado, no valorMaximo/porcentaje/isActive', () => {
    const b = bloque('async updateEvaluacion(', '// ── Planilla');
    expect(b).toContain("'puntajeMaximo'");
    expect(b).toContain("'ponderacion'");
    expect(b).toContain("'estado'");
    expect(b).not.toContain("'valorMaximo'");
    expect(b).not.toContain("'porcentaje'");
    expect(b).not.toContain("'isActive'");
  });

  it('getAsistencia() lee a.justificacion, no a.observaciones — la columna no existe en ed_asistencia', () => {
    const b = bloque('async getAsistencia(', 'async bulkAsistencia(');
    expect(b).toContain('a.justificacion');
    expect(b).not.toContain('a.observaciones');
  });

  it('bulkAsistencia() usa justificacion y el ON CONFLICT apunta al índice parcial (asignaturaId IS NULL)', () => {
    const b = bloque('async bulkAsistencia(', 'async statsAsistencia(');
    expect(b).toContain('justificacion');
    expect(b).not.toContain('"empresaId","estudianteId","seccionId",fecha,estado,observaciones');
    // uq_ed_asistencia_general_por_dia (AsistenciaGeneralUnicaPorDia1763200000000) —
    // este endpoint nunca manda asignaturaId, así que el arbiter debe ser el
    // índice parcial, no el UNIQUE de 3 columnas (que nunca empataría con NULL).
    expect(b).toContain('ON CONFLICT ("estudianteId", fecha) WHERE "asignaturaId" IS NULL');
    expect(b).not.toContain('ON CONFLICT ("estudianteId","seccionId",fecha)');
    expect(b).not.toContain('ON CONFLICT ("estudianteId", fecha, "asignaturaId")');
  });
});

/**
 * Contrato: un período cerrado (ed_periodos.estado = 'cerrado') congela
 * evaluaciones y calificaciones — es lo que le da validez al boletín
 * impreso. La regla vive en periodo.util.ts (compartida con
 * boletines.service.ts) y se invoca desde los tres caminos de escritura.
 */
describe('SQL crudo de academico.service.ts — bloqueo de período cerrado', () => {
  const leer = (...ruta: string[]) => readFileSync(join(__dirname, ...ruta), 'utf8');
  const src = () => leer('academico.service.ts');
  const bloque = (inicio: string, fin: string) => {
    const s = src();
    return s.slice(s.indexOf(inicio), s.indexOf(fin));
  };

  it('createEvaluacion() llama assertPeriodoAbierto() antes de insertar', () => {
    const b = bloque('async createEvaluacion(', 'async updateEvaluacion(');
    expect(b).toContain('assertPeriodoAbierto(');
  });

  it('updateEvaluacion() resuelve el período de la evaluación existente y lo valida', () => {
    const b = bloque('async updateEvaluacion(', '// ── Planilla');
    expect(b).toContain('assertPeriodoAbierto(');
    expect(b).toContain('"periodoId" FROM ed_evaluaciones');
  });

  it('bulkCalificaciones() valida TODOS los períodos involucrados antes de escribir la primera fila', () => {
    const b = bloque('async bulkCalificaciones(', 'async getAsistencia(');
    expect(b).toContain('assertPeriodoAbierto(');
    expect(b).toContain('FROM ed_evaluaciones WHERE id = ANY($1)');
  });
});

describe('AcademicoService — un período cerrado bloquea evaluaciones y calificaciones', () => {
  const PERIODO_ABIERTO = { id: 1, nombre: 'P1', estado: 'abierto' };
  const PERIODO_CERRADO = { id: 2, nombre: 'P2', estado: 'cerrado' };

  function buildService(opts: { periodos: Record<number, any>; evaluaciones?: Record<number, any> }) {
    const inserts: string[] = [];
    const ds = {
      query: jest.fn(async (sql: string, params: any[] = []) => {
        if (sql.includes('FROM ed_periodos WHERE id = $1 AND "empresaId"')) {
          return opts.periodos[params[0]] ? [opts.periodos[params[0]]] : [];
        }
        if (sql.includes('SELECT id, "periodoId" FROM ed_evaluaciones WHERE id = $1')) {
          const ev = opts.evaluaciones?.[params[0]];
          return ev ? [{ id: params[0], periodoId: ev.periodoId }] : [];
        }
        if (sql.includes('SELECT id, "periodoId" FROM ed_evaluaciones WHERE id = ANY($1)')) {
          const ids: number[] = params[0];
          return ids.filter(id => opts.evaluaciones?.[id]).map(id => ({ id, periodoId: opts.evaluaciones![id].periodoId }));
        }
        if (sql.includes('FROM ed_periodos WHERE id = ANY($1)')) {
          const ids: number[] = params[0];
          return ids.map(id => opts.periodos[id]).filter(Boolean);
        }
        if (sql.trimStart().toUpperCase().startsWith('INSERT') || sql.trimStart().toUpperCase().startsWith('WITH')) {
          inserts.push(sql);
          return [{}];
        }
        return [];
      }),
    };
    return { svc: new AcademicoService(ds as any), inserts };
  }

  it('createEvaluacion() en un período cerrado se rechaza', async () => {
    const { svc } = buildService({ periodos: { 2: PERIODO_CERRADO } });
    await expect(svc.createEvaluacion(1, { periodoId: 2, seccionId: 1, asignaturaId: 1, nombre: 'x' }))
      .rejects.toThrow(BadRequestException);
  });

  it('createEvaluacion() en un período abierto procede', async () => {
    const { svc, inserts } = buildService({ periodos: { 1: PERIODO_ABIERTO } });
    await svc.createEvaluacion(1, { periodoId: 1, seccionId: 1, asignaturaId: 1, nombre: 'x' });
    expect(inserts).toHaveLength(1);
  });

  it('updateEvaluacion() se rechaza si la evaluación pertenece a un período cerrado', async () => {
    const { svc } = buildService({
      periodos: { 2: PERIODO_CERRADO },
      evaluaciones: { 10: { periodoId: 2 } },
    });
    await expect(svc.updateEvaluacion(1, 10, { nombre: 'nuevo nombre' })).rejects.toThrow(BadRequestException);
  });

  it('bulkCalificaciones() se rechaza si CUALQUIERA de las evaluaciones cae en un período cerrado', async () => {
    const { svc, inserts } = buildService({
      periodos: { 1: PERIODO_ABIERTO, 2: PERIODO_CERRADO },
      evaluaciones: { 10: { periodoId: 1 }, 20: { periodoId: 2 } },
    });
    await expect(svc.bulkCalificaciones(1, [
      { evaluacionId: 10, estudianteId: 1, nota: 90 },
      { evaluacionId: 20, estudianteId: 1, nota: 80 },
    ])).rejects.toThrow(BadRequestException);
    expect(inserts).toHaveLength(0); // ninguna se guarda — falla junta, no a medias
  });

  it('bulkCalificaciones() procede si todas las evaluaciones están en períodos abiertos', async () => {
    const { svc, inserts } = buildService({
      periodos: { 1: PERIODO_ABIERTO },
      evaluaciones: { 10: { periodoId: 1 } },
    });
    const r = await svc.bulkCalificaciones(1, [{ evaluacionId: 10, estudianteId: 1, nota: 90 }]);
    expect(r.saved).toBe(1);
    expect(inserts).toHaveLength(1);
  });
});

describe('assertPeriodoAbierto() (periodo.util.ts)', () => {
  it('no lanza si el período está abierto', () => {
    expect(() => assertPeriodoAbierto({ estado: 'abierto' })).not.toThrow();
  });
  it('lanza BadRequestException si está cerrado, con el nombre del período en el mensaje', () => {
    expect(() => assertPeriodoAbierto({ estado: 'cerrado', nombre: 'Primer trimestre' }))
      .toThrow(/Primer trimestre.*cerrado/);
  });
  it('no lanza si el período es null/undefined (nada que bloquear)', () => {
    expect(() => assertPeriodoAbierto(null)).not.toThrow();
    expect(() => assertPeriodoAbierto(undefined)).not.toThrow();
  });
});

// ── Verificación real contra Postgres — requiere BD ───────────────────────────
const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('ed_evaluaciones / ed_asistencia — EXPLAIN y SELECT reales contra Postgres', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type:     'postgres',
      host:     process.env['DB_HOST'],
      port:     Number(process.env['DB_PORT'] ?? 5432),
      username: process.env['DB_USERNAME'],
      password: process.env['DB_PASSWORD'],
      database: process.env['DB_NAME'],
      ssl:      process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  it('el INSERT de createEvaluacion() es válido contra el esquema real (EXPLAIN, no ejecuta)', async () => {
    await expect(dataSource.query(
      `EXPLAIN INSERT INTO ed_evaluaciones (
         "empresaId","seccionId","asignaturaId","periodoId",
         nombre, tipo, fecha, "puntajeMaximo", ponderacion
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [-1, -1, -1, null, 'Prueba', 'evaluacion', null, 100, 100],
    )).resolves.toBeDefined();
  });

  it('el SELECT de getAsistencia() no truena (0 filas es una respuesta válida)', async () => {
    await expect(dataSource.query(
      `SELECT a."estudianteId", a.estado, a.justificacion, a.id
       FROM ed_asistencia a
       WHERE a."seccionId" = $1 AND a.fecha = $2 AND a."empresaId" = $3`,
      [-1, '2026-01-01', -1],
    )).resolves.toEqual([]);
  });

  it('el INSERT/ON CONFLICT de bulkAsistencia() es válido contra el esquema real (EXPLAIN, no ejecuta)', async () => {
    // Requiere la migración AsistenciaGeneralUnicaPorDia1763200000000 aplicada
    // (crea uq_ed_asistencia_general_por_dia) — si esto falla con "no unique
    // or exclusion constraint matching the ON CONFLICT specification", el
    // índice parcial no está.
    await expect(dataSource.query(
      `EXPLAIN INSERT INTO ed_asistencia ("empresaId","estudianteId","seccionId",fecha,estado,justificacion)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("estudianteId", fecha) WHERE "asignaturaId" IS NULL
       DO UPDATE SET estado = $5, justificacion = $6`,
      [-1, -1, -1, '2026-01-01', 'presente', null],
    )).resolves.toBeDefined();
  });

  it('reenviar la misma asistencia general no duplica filas (idempotente con el índice parcial)', async () => {
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      // "estudianteId" y "seccionId" tienen FK real — hace falta una fila de
      // cada una (dentro de la transacción, nunca se confirma) para probar
      // el INSERT de verdad en vez de EXPLAIN.
      const [est] = await qr.query(
        `INSERT INTO ed_estudiantes ("empresaId", nombres, apellidos) VALUES (-999, 'Prueba', 'Idempotencia') RETURNING id`,
      );
      const [grado] = await qr.query(
        `INSERT INTO ed_grados ("empresaId", nombre) VALUES (-999, 'Prueba') RETURNING id`,
      );
      const [seccion] = await qr.query(
        `INSERT INTO ed_secciones ("empresaId", "gradoId", nombre) VALUES (-999, $1, 'Prueba') RETURNING id`,
        [grado.id],
      );
      const insertar = () => qr.query(
        `INSERT INTO ed_asistencia ("empresaId","estudianteId","seccionId",fecha,estado,justificacion)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT ("estudianteId", fecha) WHERE "asignaturaId" IS NULL
         DO UPDATE SET estado = $5, justificacion = $6`,
        [-999, est.id, seccion.id, '2026-01-01', 'presente', null],
      );
      await insertar();
      await insertar(); // reenvío — debe actualizar, no duplicar
      const rows = await qr.query(
        `SELECT COUNT(*)::int AS n FROM ed_asistencia WHERE "estudianteId" = $1 AND fecha = '2026-01-01'`,
        [est.id],
      );
      expect(rows[0].n).toBe(1);
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
  });
});

(TIENE_BD ? describe : describe.skip)('AcademicoService — período cerrado, contra Postgres real (con limpieza al final)', () => {
  let dataSource: DataSource;
  const EMPRESA = -779;
  let periodoAbiertoId: number, periodoCerradoId: number, seccionId: number, asignaturaId: number;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres', host: process.env['DB_HOST'], port: Number(process.env['DB_PORT'] ?? 5432),
      username: process.env['DB_USERNAME'], password: process.env['DB_PASSWORD'], database: process.env['DB_NAME'],
      ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
    });
    await dataSource.initialize();
    const [anio] = await dataSource.query(
      `INSERT INTO ed_anios_escolares ("empresaId", nombre, "fechaInicio", "fechaFin") VALUES ($1,'PruebaCerrado','2099-08-01','2100-06-01') RETURNING id`,
      [EMPRESA],
    );
    const [pAbierto] = await dataSource.query(
      `INSERT INTO ed_periodos ("empresaId","anioEscolarId",nombre,numero,estado) VALUES ($1,$2,'Abierto',1,'abierto') RETURNING id`,
      [EMPRESA, anio.id],
    );
    periodoAbiertoId = pAbierto.id;
    const [pCerrado] = await dataSource.query(
      `INSERT INTO ed_periodos ("empresaId","anioEscolarId",nombre,numero,estado) VALUES ($1,$2,'Cerrado',2,'cerrado') RETURNING id`,
      [EMPRESA, anio.id],
    );
    periodoCerradoId = pCerrado.id;
    const [grado] = await dataSource.query(`INSERT INTO ed_grados ("empresaId", nombre) VALUES ($1,'G') RETURNING id`, [EMPRESA]);
    const [seccion] = await dataSource.query(`INSERT INTO ed_secciones ("empresaId","gradoId",nombre) VALUES ($1,$2,'A') RETURNING id`, [EMPRESA, grado.id]);
    seccionId = seccion.id;
    const [asig] = await dataSource.query(`INSERT INTO ed_asignaturas ("empresaId", nombre) VALUES ($1,'Prueba') RETURNING id`, [EMPRESA]);
    asignaturaId = asig.id;
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM ed_calificaciones WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_evaluaciones WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_asignaturas WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_secciones WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_grados WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_periodos WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_anios_escolares WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource?.destroy();
  });

  it('createEvaluacion() en el período cerrado se rechaza de verdad contra Postgres', async () => {
    const svc = new AcademicoService(dataSource);
    await expect(svc.createEvaluacion(EMPRESA, {
      periodoId: periodoCerradoId, seccionId, asignaturaId, nombre: 'No debería crearse',
    })).rejects.toThrow(BadRequestException);
    const rows = await dataSource.query(`SELECT id FROM ed_evaluaciones WHERE "empresaId" = $1`, [EMPRESA]);
    expect(rows).toHaveLength(0);
  });

  it('createEvaluacion() en el período abierto sí procede, y bulkCalificaciones() sobre ella también', async () => {
    const svc = new AcademicoService(dataSource);
    const ev = await svc.createEvaluacion(EMPRESA, {
      periodoId: periodoAbiertoId, seccionId, asignaturaId, nombre: 'Examen', puntajeMaximo: 100, ponderacion: 100,
    });
    expect(ev.id).toBeDefined();

    const [est] = await dataSource.query(`INSERT INTO ed_estudiantes ("empresaId", nombres, apellidos) VALUES ($1,'P','C') RETURNING id`, [EMPRESA]);
    const r = await svc.bulkCalificaciones(EMPRESA, [{ evaluacionId: ev.id, estudianteId: est.id, nota: 95 }]);
    expect(r.saved).toBe(1);

    // Cerrar el período y confirmar que ya no se puede tocar ni la evaluación ni la calificación
    await dataSource.query(`UPDATE ed_periodos SET estado = 'cerrado' WHERE id = $1`, [periodoAbiertoId]);
    await expect(svc.updateEvaluacion(EMPRESA, ev.id, { nombre: 'Renombrado' })).rejects.toThrow(BadRequestException);
    await expect(svc.bulkCalificaciones(EMPRESA, [{ evaluacionId: ev.id, estudianteId: est.id, nota: 100 }])).rejects.toThrow(BadRequestException);
    await dataSource.query(`UPDATE ed_periodos SET estado = 'abierto' WHERE id = $1`, [periodoAbiertoId]);
  });
});
