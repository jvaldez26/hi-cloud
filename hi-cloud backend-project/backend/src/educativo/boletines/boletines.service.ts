import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { redondearMoneda } from '../../common/utils/moneda.util';
import { assertPeriodoAbierto } from '../common/periodo.util';

/**
 * Boletines — consolidación de notas por período y generación de boletines.
 *
 * Nada del cálculo está fijo en código: la escala (escalaMinima/escalaMaxima),
 * la nota mínima para aprobar y si se usan letras (y con qué rangos) salen
 * TODAS de ed_config. Un colegio con escala 0-100 y otro con escala 1-10
 * (o un bilingüe con letras A-F) usan exactamente el mismo código.
 */
@Injectable()
export class BoletinesService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // ── Config con defaults ──────────────────────────────────────────────────
  // Sin fila en ed_config (colegio que nunca configuró nada) el módulo no
  // debe romperse — usa los defaults documentados en ed-config.entity.ts.
  private async config(empresaId: number) {
    const [row] = await this.ds.query<any[]>(`SELECT * FROM ed_config WHERE "empresaId" = $1`, [empresaId]);
    return row ?? {
      nombreCentro: null, codigoMinerd: null,
      escalaMinima: 0, escalaMaxima: 100, notaMinimaAprobar: 70,
      usaLetras: false, escalaLetras: null,
    };
  }

  private async periodo(empresaId: number, periodoId: number) {
    const [p] = await this.ds.query<any[]>(
      `SELECT * FROM ed_periodos WHERE id = $1 AND "empresaId" = $2`,
      [periodoId, empresaId],
    );
    if (!p) throw new NotFoundException(`Período #${periodoId} no encontrado`);
    return p;
  }

  /** Letra correspondiente a una nota, según ed_config.escalaLetras — [{min,max,letra}]. */
  private letraDeNota(nota: number, escalaLetras: any): string | null {
    if (!Array.isArray(escalaLetras)) return null;
    const match = escalaLetras.find((r: any) => nota >= Number(r.min) && nota <= Number(r.max));
    return match?.letra ?? null;
  }

  // ── Pensum del grado de una sección ──────────────────────────────────────
  private async pensumDeSeccion(empresaId: number, seccionId: number) {
    const [seccion] = await this.ds.query<any[]>(
      `SELECT s.*, g.nombre AS "gradoNombre" FROM ed_secciones s
       JOIN ed_grados g ON g.id = s."gradoId"
       WHERE s.id = $1 AND s."empresaId" = $2`,
      [seccionId, empresaId],
    );
    if (!seccion) throw new NotFoundException(`Sección #${seccionId} no encontrada`);

    const asignaturas = await this.ds.query<any[]>(
      `SELECT a.id, a.nombre, a.area, ga.orden
       FROM ed_grado_asignaturas ga
       JOIN ed_asignaturas a ON a.id = ga."asignaturaId"
       WHERE ga."gradoId" = $1 AND ga."empresaId" = $2 AND a."isActive" = true
       ORDER BY ga.orden, a.nombre`,
      [seccion.gradoId, empresaId],
    );
    return { seccion, asignaturas };
  }

  // ── 1. Consolidar notas del período ──────────────────────────────────────

  /**
   * Promedio ponderado por asignatura: cada evaluación normalizada a
   * porcentaje (nota/puntajeMaximo) se pesa por su ponderación, y el
   * resultado (0-1) se proyecta sobre la escala del colegio
   * [escalaMinima, escalaMaxima] — así una escala 0-100 y una 1-10 usan la
   * misma fórmula sin ningún caso especial.
   *
   * Solo se considera "completa" (notaFinal numérico) una asignatura cuando
   * TODAS sus evaluaciones activas del período tienen calificación
   * registrada — si falta una, o si no hay evaluaciones todavía, notaFinal
   * queda NULL: es justo lo que la vista previa de BoletinesPage usa para
   * avisar "asignaturas sin calificar", no un 0 disfrazado de nota real.
   */
  async calcularNotasPeriodo(empresaId: number, seccionId: number, periodoId: number) {
    const periodo = await this.periodo(empresaId, periodoId);
    assertPeriodoAbierto(periodo);

    const cfg = await this.config(empresaId);
    const { seccion, asignaturas } = await this.pensumDeSeccion(empresaId, seccionId);
    if (seccion.gradoId == null) throw new BadRequestException('La sección no tiene grado asignado');
    if (!asignaturas.length) {
      throw new BadRequestException(
        `El grado "${seccion.gradoNombre}" no tiene pensum configurado — agrega asignaturas en Estructura Académica → Pensum antes de consolidar notas.`,
      );
    }

    const estudiantes = await this.ds.query<any[]>(
      `SELECT e.id FROM ed_matriculas m
       JOIN ed_estudiantes e ON e.id = m."estudianteId"
       WHERE m."seccionId" = $1 AND m."empresaId" = $2 AND m.estado = 'activa'`,
      [seccionId, empresaId],
    );
    if (!estudiantes.length) return { procesados: 0, completos: 0, incompletos: 0, asignaturas: asignaturas.length, estudiantes: 0 };

    const asignaturaIds = asignaturas.map((a: any) => a.id);
    const evaluaciones = await this.ds.query<any[]>(
      `SELECT id, "asignaturaId", "puntajeMaximo", ponderacion
       FROM ed_evaluaciones
       WHERE "seccionId" = $1 AND "periodoId" = $2 AND "asignaturaId" = ANY($3)
         AND "empresaId" = $4 AND estado = 'activa'`,
      [seccionId, periodoId, asignaturaIds, empresaId],
    );
    const evalPorAsignatura = new Map<number, any[]>();
    for (const ev of evaluaciones) {
      if (!evalPorAsignatura.has(ev.asignaturaId)) evalPorAsignatura.set(ev.asignaturaId, []);
      evalPorAsignatura.get(ev.asignaturaId)!.push(ev);
    }

    const evalIds = evaluaciones.map((e: any) => e.id);
    const calificaciones = evalIds.length
      ? await this.ds.query<any[]>(
          `SELECT "evaluacionId", "estudianteId", nota FROM ed_calificaciones
           WHERE "evaluacionId" = ANY($1) AND "empresaId" = $2 AND nota IS NOT NULL`,
          [evalIds, empresaId],
        )
      : [];
    const notaPorClave = new Map<string, number>();
    for (const c of calificaciones) notaPorClave.set(`${c.evaluacionId}_${c.estudianteId}`, Number(c.nota));

    let completos = 0, incompletos = 0, procesados = 0;
    const escalaMin = Number(cfg.escalaMinima ?? 0);
    const escalaMax = Number(cfg.escalaMaxima ?? 100);
    const notaMinAprobar = Number(cfg.notaMinimaAprobar ?? 70);

    for (const est of estudiantes) {
      for (const asig of asignaturas) {
        const evsAsig = evalPorAsignatura.get(asig.id) ?? [];
        let notaFinal: number | null = null;
        let notaLetra: string | null = null;
        let aprobado: boolean | null = null;

        if (evsAsig.length) {
          let sumaPonderada = 0, sumaPonderacion = 0, completo = true;
          for (const ev of evsAsig) {
            const nota = notaPorClave.get(`${ev.id}_${est.id}`);
            if (nota === undefined) { completo = false; break; }
            const puntajeMaximo = Number(ev.puntajeMaximo) || 100;
            const ponderacion = Number(ev.ponderacion ?? 100);
            sumaPonderada += (nota / puntajeMaximo) * ponderacion;
            sumaPonderacion += ponderacion;
          }
          if (completo && sumaPonderacion > 0) {
            const fraccion = sumaPonderada / sumaPonderacion;
            notaFinal = redondearMoneda(escalaMin + fraccion * (escalaMax - escalaMin));
            aprobado = notaFinal >= notaMinAprobar;
            if (cfg.usaLetras) notaLetra = this.letraDeNota(notaFinal, cfg.escalaLetras);
          }
        }

        await this.ds.query(
          `INSERT INTO ed_notas_periodo
             ("empresaId","estudianteId","asignaturaId","seccionId","periodoId","notaFinal","notaLetra",aprobado)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT ("estudianteId","asignaturaId","periodoId")
           DO UPDATE SET "notaFinal" = $6, "notaLetra" = $7, aprobado = $8, "seccionId" = $4`,
          [empresaId, est.id, asig.id, seccionId, periodoId, notaFinal, notaLetra, aprobado],
        );
        procesados++;
        if (notaFinal !== null) completos++; else incompletos++;
      }
    }

    return { procesados, completos, incompletos, asignaturas: asignaturas.length, estudiantes: estudiantes.length };
  }

  // ── Vista previa: quién tiene notas completas y quién no ─────────────────
  async resumenSeccion(empresaId: number, seccionId: number, periodoId: number) {
    await this.periodo(empresaId, periodoId); // valida que exista/pertenezca a la empresa
    const { asignaturas } = await this.pensumDeSeccion(empresaId, seccionId);
    const totalAsignaturas = asignaturas.length;

    const estudiantes = await this.ds.query<any[]>(
      `SELECT e.id, e.nombres, e.apellidos, e.cedula
       FROM ed_matriculas m
       JOIN ed_estudiantes e ON e.id = m."estudianteId"
       WHERE m."seccionId" = $1 AND m."empresaId" = $2 AND m.estado = 'activa'
       ORDER BY e.apellidos, e.nombres`,
      [seccionId, empresaId],
    );

    const notas = await this.ds.query<any[]>(
      `SELECT "estudianteId", COUNT(*) FILTER (WHERE "notaFinal" IS NOT NULL)::int AS "conNota"
       FROM ed_notas_periodo
       WHERE "seccionId" = $1 AND "periodoId" = $2 AND "empresaId" = $3
       GROUP BY "estudianteId"`,
      [seccionId, periodoId, empresaId],
    );
    const conNotaPorEstudiante = new Map(notas.map((n: any) => [n.estudianteId, n.conNota]));

    const resultado = estudiantes.map((e: any) => {
      const conNota = conNotaPorEstudiante.get(e.id) ?? 0;
      return {
        estudianteId: e.id,
        nombre: `${e.apellidos}, ${e.nombres}`,
        cedula: e.cedula,
        totalAsignaturas,
        conNota,
        completo: totalAsignaturas > 0 && conNota === totalAsignaturas,
      };
    });

    return {
      totalAsignaturas,
      estudiantes: resultado,
      completos: resultado.filter(r => r.completo).length,
      incompletos: resultado.filter(r => !r.completo).length,
    };
  }

  // ── Datos consolidados para el PDF (un estudiante, todos los períodos del año) ──

  /**
   * Arma todo lo que el boletín necesita: datos del estudiante y su
   * matrícula, config del centro, el pensum completo del grado (para que
   * una asignatura sin ninguna nota aparezca igual, vacía), la nota de cada
   * período + una "final" (promedio ponderado por período.ponderacion), y
   * el resumen de asistencia.
   */
  async datosBoletin(empresaId: number, estudianteId: number, periodoId: number) {
    const cfg = await this.config(empresaId);
    const periodoAncla = await this.periodo(empresaId, periodoId);

    const [matricula] = await this.ds.query<any[]>(
      `SELECT m.*, g.nombre AS "gradoNombre", s.nombre AS "seccionNombre", s.id AS "seccionIdReal"
       FROM ed_matriculas m
       JOIN ed_grados g ON g.id = m."gradoId"
       LEFT JOIN ed_secciones s ON s.id = m."seccionId"
       WHERE m."estudianteId" = $1 AND m."anioEscolarId" = $2 AND m."empresaId" = $3
       ORDER BY m.id DESC LIMIT 1`,
      [estudianteId, periodoAncla.anioEscolarId, empresaId],
    );
    if (!matricula) throw new NotFoundException('El estudiante no tiene una matrícula para el año escolar de este período');

    const [estudiante] = await this.ds.query<any[]>(
      `SELECT * FROM ed_estudiantes WHERE id = $1 AND "empresaId" = $2`,
      [estudianteId, empresaId],
    );
    if (!estudiante) throw new NotFoundException('Estudiante no encontrado');

    const periodos = await this.ds.query<any[]>(
      `SELECT * FROM ed_periodos WHERE "anioEscolarId" = $1 AND "empresaId" = $2 ORDER BY numero`,
      [periodoAncla.anioEscolarId, empresaId],
    );

    const { asignaturas } = await this.pensumDeSeccion(empresaId, matricula.gradoId);

    const notas = await this.ds.query<any[]>(
      `SELECT * FROM ed_notas_periodo
       WHERE "estudianteId" = $1 AND "periodoId" = ANY($2) AND "empresaId" = $3`,
      [estudianteId, periodos.map((p: any) => p.id), empresaId],
    );
    const notaPorClave = new Map(notas.map((n: any) => [`${n.asignaturaId}_${n.periodoId}`, n]));

    const escalaMin = Number(cfg.escalaMinima ?? 0);
    const escalaMax = Number(cfg.escalaMaxima ?? 100);
    const pesoTotalPeriodos = periodos.reduce((s: number, p: any) => s + Number(p.ponderacion ?? 0), 0) || periodos.length;

    const filas = asignaturas.map((asig: any) => {
      const porPeriodo = periodos.map((p: any) => notaPorClave.get(`${asig.id}_${p.id}`)?.notaFinal ?? null);
      const conNota = periodos
        .map((p: any, i: number) => ({ nota: porPeriodo[i], peso: Number(p.ponderacion ?? 0) }))
        .filter(x => x.nota !== null);
      let final: number | null = null;
      if (conNota.length === periodos.length && periodos.length > 0) {
        const suma = conNota.reduce((s, x) => s + Number(x.nota) * (x.peso || 1), 0);
        const pesos = conNota.reduce((s, x) => s + (x.peso || 1), 0) || pesoTotalPeriodos;
        final = redondearMoneda(suma / pesos);
      }
      return {
        asignaturaId: asig.id,
        nombre: asig.nombre,
        area: asig.area,
        porPeriodo,
        final,
        finalLetra: final !== null && cfg.usaLetras ? this.letraDeNota(final, cfg.escalaLetras) : null,
      };
    });

    const notasConFinal = filas.filter(f => f.final !== null);
    const promedioGeneral = notasConFinal.length
      ? redondearMoneda(notasConFinal.reduce((s, f) => s + Number(f.final), 0) / notasConFinal.length)
      : null;

    const [asistencia] = matricula.seccionIdReal
      ? await this.ds.query<any[]>(
          `SELECT
             COUNT(*) FILTER (WHERE estado = 'presente')::int AS presente,
             COUNT(*) FILTER (WHERE estado = 'ausente')::int AS ausente,
             COUNT(*) FILTER (WHERE estado = 'tardanza')::int AS tardanza,
             COUNT(*) FILTER (WHERE estado = 'justificado')::int AS justificado
           FROM ed_asistencia
           WHERE "estudianteId" = $1 AND "empresaId" = $2`,
          [estudianteId, empresaId],
        )
      : [{ presente: 0, ausente: 0, tardanza: 0, justificado: 0 }];

    const [tutorPrincipal] = await this.ds.query<any[]>(
      `SELECT t.nombres, t.apellidos FROM ed_estudiante_tutores et
       JOIN ed_tutores t ON t.id = et."tutorId"
       WHERE et."estudianteId" = $1
       ORDER BY et."esPrincipal" DESC LIMIT 1`,
      [estudianteId],
    );

    return {
      config: cfg,
      estudiante,
      matricula,
      periodos,
      asignaturas: filas,
      promedioGeneral,
      asistencia: asistencia ?? { presente: 0, ausente: 0, tardanza: 0, justificado: 0 },
      tutorPrincipal: tutorPrincipal ?? null,
    };
  }

  // ── Estudiantes de una sección, para el boletín masivo ───────────────────
  async estudiantesDeSeccion(empresaId: number, seccionId: number) {
    return this.ds.query<any[]>(
      `SELECT e.id FROM ed_matriculas m
       JOIN ed_estudiantes e ON e.id = m."estudianteId"
       WHERE m."seccionId" = $1 AND m."empresaId" = $2 AND m.estado = 'activa'
       ORDER BY e.apellidos, e.nombres`,
      [seccionId, empresaId],
    );
  }
}
