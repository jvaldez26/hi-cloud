import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BoletinesService } from './boletines.service';

/**
 * calcularNotasPeriodo() es el corazón de los boletines: promedio ponderado
 * de evaluaciones, proyectado sobre la escala configurable de ed_config
 * (nunca fija en código — un colegio 0-100 y uno 1-10 corren la misma
 * fórmula), y "completa" solo cuando TODAS las evaluaciones activas de la
 * asignatura tienen calificación — si falta una, notaFinal queda NULL en
 * vez de un 0 disfrazado de nota real.
 *
 * Se prueba con un DataSource falso que enruta por fragmentos del SQL —
 * mismo patrón que el resto de *-sql.spec.ts / *.spec.ts de educativo.
 */
function buildService(opts: {
  config?: any;
  periodo?: any;
  seccion?: any;
  pensum?: any[];
  estudiantes?: any[];
  evaluaciones?: any[];
  calificaciones?: any[];
} = {}) {
  const inserts: { params: any[] }[] = [];
  const ds = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes('FROM ed_config')) return opts.config === undefined ? [] : [opts.config];
      if (sql.includes('FROM ed_periodos WHERE id')) return opts.periodo === undefined ? [] : [opts.periodo];
      if (sql.includes('FROM ed_secciones s')) return opts.seccion === undefined ? [] : [opts.seccion];
      if (sql.includes('FROM ed_grado_asignaturas')) return opts.pensum ?? [];
      if (sql.includes('FROM ed_matriculas m') && sql.includes('JOIN ed_estudiantes e ON e.id')) return opts.estudiantes ?? [];
      if (sql.includes('FROM ed_evaluaciones')) return opts.evaluaciones ?? [];
      if (sql.includes('FROM ed_calificaciones')) return opts.calificaciones ?? [];
      if (sql.includes('INSERT INTO ed_notas_periodo')) {
        inserts.push({ params });
        return [];
      }
      return [];
    }),
  };
  const svc = new BoletinesService(ds as any as DataSource);
  return { svc, inserts };
}

const PERIODO_ABIERTO = { id: 1, empresaId: 1, anioEscolarId: 1, nombre: 'Primer trimestre', estado: 'abierto' };
const SECCION = { id: 10, empresaId: 1, gradoId: 5, gradoNombre: '1ro de Primaria' };
const ESTUDIANTE = { id: 100 };
const ASIGNATURA = { id: 50, nombre: 'Matemática', area: 'Matemática', orden: 0 };

describe('BoletinesService.calcularNotasPeriodo()', () => {
  it('rechaza un período que no existe', async () => {
    const { svc } = buildService({ periodo: null });
    await expect(svc.calcularNotasPeriodo(1, 10, 999)).rejects.toThrow(NotFoundException);
  });

  it('rechaza un período cerrado — es lo que le da validez al boletín impreso', async () => {
    const { svc } = buildService({ periodo: { ...PERIODO_ABIERTO, estado: 'cerrado' }, seccion: SECCION, pensum: [ASIGNATURA] });
    await expect(svc.calcularNotasPeriodo(1, 10, 1)).rejects.toThrow(BadRequestException);
  });

  it('rechaza un grado sin pensum configurado, con mensaje claro (no un boletín vacío silencioso)', async () => {
    const { svc } = buildService({ periodo: PERIODO_ABIERTO, seccion: SECCION, pensum: [] });
    await expect(svc.calcularNotasPeriodo(1, 10, 1)).rejects.toThrow(/pensum/);
  });

  it('escala 0-100 (default): promedio ponderado normalizado, redondeado a 2 decimales', async () => {
    // Examen: 80/100 pondera 60% — Tarea: 18/20 (90%) pondera 40%.
    // fracción = (0.80*60 + 0.90*40) / 100 = 0.84 → sobre [0,100] = 84.00
    const { svc, inserts } = buildService({
      periodo: PERIODO_ABIERTO,
      seccion: SECCION,
      pensum: [ASIGNATURA],
      estudiantes: [ESTUDIANTE],
      config: { escalaMinima: 0, escalaMaxima: 100, notaMinimaAprobar: 70, usaLetras: false },
      evaluaciones: [
        { id: 1, asignaturaId: 50, puntajeMaximo: 100, ponderacion: 60 },
        { id: 2, asignaturaId: 50, puntajeMaximo: 20, ponderacion: 40 },
      ],
      calificaciones: [
        { evaluacionId: 1, estudianteId: 100, nota: 80 },
        { evaluacionId: 2, estudianteId: 100, nota: 18 },
      ],
    });
    const r = await svc.calcularNotasPeriodo(1, 10, 1);
    expect(r).toEqual({ procesados: 1, completos: 1, incompletos: 0, asignaturas: 1, estudiantes: 1 });
    expect(inserts).toHaveLength(1);
    const [, , , , , notaFinal, notaLetra, aprobado] = inserts[0].params;
    expect(notaFinal).toBe(84);
    expect(notaLetra).toBeNull();
    expect(aprobado).toBe(true);
  });

  it('escala 1-10 (colegio con escala numérica propia): la misma fracción se proyecta sobre [1,10]', async () => {
    // Una sola evaluación 70/100 → fracción 0.70 → sobre [1,10] = 1 + 0.70*9 = 7.30
    const { svc, inserts } = buildService({
      periodo: PERIODO_ABIERTO,
      seccion: SECCION,
      pensum: [ASIGNATURA],
      estudiantes: [ESTUDIANTE],
      config: { escalaMinima: 1, escalaMaxima: 10, notaMinimaAprobar: 6, usaLetras: false },
      evaluaciones: [{ id: 1, asignaturaId: 50, puntajeMaximo: 100, ponderacion: 100 }],
      calificaciones: [{ evaluacionId: 1, estudianteId: 100, nota: 70 }],
    });
    await svc.calcularNotasPeriodo(1, 10, 1);
    const [, , , , , notaFinal, , aprobado] = inserts[0].params;
    expect(notaFinal).toBe(7.3);
    expect(aprobado).toBe(true);
  });

  it('colegio con letras: resuelve notaLetra desde escalaLetras (rangos configurables, no hardcodeados)', async () => {
    const { svc, inserts } = buildService({
      periodo: PERIODO_ABIERTO,
      seccion: SECCION,
      pensum: [ASIGNATURA],
      estudiantes: [ESTUDIANTE],
      config: {
        escalaMinima: 0, escalaMaxima: 100, notaMinimaAprobar: 70, usaLetras: true,
        escalaLetras: [{ min: 90, max: 100, letra: 'A' }, { min: 80, max: 89.99, letra: 'B' }, { min: 0, max: 79.99, letra: 'C' }],
      },
      evaluaciones: [{ id: 1, asignaturaId: 50, puntajeMaximo: 100, ponderacion: 100 }],
      calificaciones: [{ evaluacionId: 1, estudianteId: 100, nota: 85 }],
    });
    await svc.calcularNotasPeriodo(1, 10, 1);
    const [, , , , , notaFinal, notaLetra] = inserts[0].params;
    expect(notaFinal).toBe(85);
    expect(notaLetra).toBe('B');
  });

  it('asignatura con una evaluación sin calificar queda incompleta (notaFinal NULL, no un 0)', async () => {
    const { svc, inserts } = buildService({
      periodo: PERIODO_ABIERTO,
      seccion: SECCION,
      pensum: [ASIGNATURA],
      estudiantes: [ESTUDIANTE],
      config: { escalaMinima: 0, escalaMaxima: 100, notaMinimaAprobar: 70, usaLetras: false },
      evaluaciones: [
        { id: 1, asignaturaId: 50, puntajeMaximo: 100, ponderacion: 50 },
        { id: 2, asignaturaId: 50, puntajeMaximo: 100, ponderacion: 50 },
      ],
      calificaciones: [{ evaluacionId: 1, estudianteId: 100, nota: 90 }], // falta la evaluación #2
    });
    const r = await svc.calcularNotasPeriodo(1, 10, 1);
    expect(r).toEqual({ procesados: 1, completos: 0, incompletos: 1, asignaturas: 1, estudiantes: 1 });
    const [, , , , , notaFinal, notaLetra, aprobado] = inserts[0].params;
    expect(notaFinal).toBeNull();
    expect(notaLetra).toBeNull();
    expect(aprobado).toBeNull();
  });

  it('asignatura sin ninguna evaluación en el período también queda incompleta, no desaparece', async () => {
    const { svc, inserts } = buildService({
      periodo: PERIODO_ABIERTO,
      seccion: SECCION,
      pensum: [ASIGNATURA],
      estudiantes: [ESTUDIANTE],
      config: { escalaMinima: 0, escalaMaxima: 100, notaMinimaAprobar: 70, usaLetras: false },
      evaluaciones: [],
      calificaciones: [],
    });
    const r = await svc.calcularNotasPeriodo(1, 10, 1);
    expect(r.incompletos).toBe(1);
    expect(inserts).toHaveLength(1); // sigue insertando la fila (asignatura visible, nota NULL)
    expect(inserts[0].params[5]).toBeNull();
  });

  it('sin fila en ed_config, usa los defaults documentados (0-100, aprobar 70, sin letras)', async () => {
    const { svc, inserts } = buildService({
      periodo: PERIODO_ABIERTO,
      seccion: SECCION,
      pensum: [ASIGNATURA],
      estudiantes: [ESTUDIANTE],
      config: undefined, // sin fila — colegio que nunca configuró nada
      evaluaciones: [{ id: 1, asignaturaId: 50, puntajeMaximo: 100, ponderacion: 100 }],
      calificaciones: [{ evaluacionId: 1, estudianteId: 100, nota: 75 }],
    });
    await svc.calcularNotasPeriodo(1, 10, 1);
    const [, , , , , notaFinal, notaLetra, aprobado] = inserts[0].params;
    expect(notaFinal).toBe(75);
    expect(aprobado).toBe(true);
    expect(notaLetra).toBeNull();
  });
});

// ── Verificación real contra Postgres — requiere BD ───────────────────────────
const TIENE_BD = !!process.env['DB_HOST'];

(TIENE_BD ? describe : describe.skip)('BoletinesService — flujo real contra Postgres (con limpieza al final)', () => {
  let dataSource: DataSource;
  const EMPRESA = -778;
  let anioId: number, periodoId: number, gradoId: number, seccionId: number, asignaturaId: number, estudianteId: number;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'],
      port: Number(process.env['DB_PORT'] ?? 5432),
      username: process.env['DB_USERNAME'],
      password: process.env['DB_PASSWORD'],
      database: process.env['DB_NAME'],
      ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
    });
    await dataSource.initialize();

    await dataSource.query(`DELETE FROM ed_config WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(
      `INSERT INTO ed_config ("empresaId", "escalaMinima", "escalaMaxima", "notaMinimaAprobar", "usaLetras", "escalaLetras")
       VALUES ($1, 0, 100, 70, false, null)`, [EMPRESA],
    );
    const [anio] = await dataSource.query(
      `INSERT INTO ed_anios_escolares ("empresaId", nombre, "fechaInicio", "fechaFin") VALUES ($1,'2099-2100','2099-08-01','2100-06-01') RETURNING id`,
      [EMPRESA],
    );
    anioId = anio.id;
    const [periodo] = await dataSource.query(
      `INSERT INTO ed_periodos ("empresaId","anioEscolarId",nombre,numero,estado) VALUES ($1,$2,'P1',1,'abierto') RETURNING id`,
      [EMPRESA, anioId],
    );
    periodoId = periodo.id;
    const [grado] = await dataSource.query(
      `INSERT INTO ed_grados ("empresaId", nombre) VALUES ($1, 'Grado Prueba Boletines') RETURNING id`, [EMPRESA],
    );
    gradoId = grado.id;
    const [seccion] = await dataSource.query(
      `INSERT INTO ed_secciones ("empresaId","gradoId",nombre) VALUES ($1,$2,'A') RETURNING id`, [EMPRESA, gradoId],
    );
    seccionId = seccion.id;
    const [asig] = await dataSource.query(
      `INSERT INTO ed_asignaturas ("empresaId", nombre) VALUES ($1, 'Matemática Prueba') RETURNING id`, [EMPRESA],
    );
    asignaturaId = asig.id;
    await dataSource.query(
      `INSERT INTO ed_grado_asignaturas ("empresaId","gradoId","asignaturaId") VALUES ($1,$2,$3)`,
      [EMPRESA, gradoId, asignaturaId],
    );
    const [est] = await dataSource.query(
      `INSERT INTO ed_estudiantes ("empresaId", nombres, apellidos) VALUES ($1,'Prueba','BoletinReal') RETURNING id`, [EMPRESA],
    );
    estudianteId = est.id;
    await dataSource.query(
      `INSERT INTO ed_matriculas ("empresaId","estudianteId","anioEscolarId","gradoId","seccionId",estado) VALUES ($1,$2,$3,$4,$5,'activa')`,
      [EMPRESA, estudianteId, anioId, gradoId, seccionId],
    );
    const [ev] = await dataSource.query(
      `INSERT INTO ed_evaluaciones ("empresaId","seccionId","asignaturaId","periodoId",nombre,"puntajeMaximo",ponderacion,estado)
       VALUES ($1,$2,$3,$4,'Examen',100,100,'activa') RETURNING id`,
      [EMPRESA, seccionId, asignaturaId, periodoId],
    );
    await dataSource.query(
      `INSERT INTO ed_calificaciones ("empresaId","evaluacionId","estudianteId",nota) VALUES ($1,$2,$3,88)`,
      [EMPRESA, ev.id, estudianteId],
    );
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM ed_notas_periodo WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_calificaciones WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_evaluaciones WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_matriculas WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_estudiantes WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_grado_asignaturas WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_asignaturas WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_secciones WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_grados WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_periodos WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_anios_escolares WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource.query(`DELETE FROM ed_config WHERE "empresaId" = $1`, [EMPRESA]);
    await dataSource?.destroy();
  });

  it('consolida, resume y genera el PDF con datos reales — y un período cerrado bloquea todo lo demás', async () => {
    const svc = new BoletinesService(dataSource);

    const r = await svc.calcularNotasPeriodo(EMPRESA, seccionId, periodoId);
    expect(r).toEqual({ procesados: 1, completos: 1, incompletos: 0, asignaturas: 1, estudiantes: 1 });

    const resumen = await svc.resumenSeccion(EMPRESA, seccionId, periodoId);
    expect(resumen.completos).toBe(1);
    expect(resumen.incompletos).toBe(0);
    expect(resumen.estudiantes[0].nombre).toContain('BoletinReal');

    const datos = await svc.datosBoletin(EMPRESA, estudianteId, periodoId);
    expect(datos.asignaturas).toHaveLength(1);
    expect(Number(datos.asignaturas[0].final)).toBe(88);
    expect(Number(datos.promedioGeneral)).toBe(88);

    // Cerrar el período y confirmar que consolidar (y por lo tanto imprimir con datos frescos) queda bloqueado
    await dataSource.query(`UPDATE ed_periodos SET estado = 'cerrado' WHERE id = $1`, [periodoId]);
    await expect(svc.calcularNotasPeriodo(EMPRESA, seccionId, periodoId)).rejects.toThrow(BadRequestException);
    await dataSource.query(`UPDATE ed_periodos SET estado = 'abierto' WHERE id = $1`, [periodoId]);
  });
});
