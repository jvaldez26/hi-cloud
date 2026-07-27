import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class EdDashboardService {
  private readonly logger = new Logger(EdDashboardService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async getDashboard(empresaId: number) {
    try {
      const [kpis] = await this.ds.query<any[]>(`
        SELECT
          (SELECT COUNT(*) FROM ed_estudiantes WHERE "empresaId" = $1 AND estado = 'activo')::int AS "estudiantesActivos",
          (SELECT COUNT(*) FROM ed_matriculas WHERE "empresaId" = $1
           AND "anioEscolarId" = (SELECT id FROM ed_anios_escolares WHERE "empresaId" = $1 AND "esActual" = true LIMIT 1))::int AS "matriculasAnioActual",
          (SELECT COUNT(*) FROM ed_cargos WHERE "empresaId" = $1 AND estado IN ('vencido','parcial'))::int AS "estudiantesMorosos",
          (SELECT COALESCE(SUM("montoPagado"), 0) FROM ed_pagos WHERE "empresaId" = $1
           AND DATE_TRUNC('month', fecha) = DATE_TRUNC('month', NOW())) AS "cobradoMes",
          (SELECT COALESCE(SUM("saldoPendiente"), 0) FROM ed_cargos WHERE "empresaId" = $1 AND estado IN ('pendiente','parcial','vencido')) AS "carteraPendiente"
        `,
        [empresaId],
      );

      const asistenciaHoy = await this.ds.query<any[]>(`
        SELECT
          (SELECT COUNT(*) FROM ed_asistencia a
           JOIN ed_secciones s ON s.id = a."seccionId"
           WHERE a."empresaId" = $1 AND a.fecha = CURRENT_DATE AND a.estado = 'presente')::int AS presentes,
          (SELECT COUNT(*) FROM ed_asistencia a
           WHERE a."empresaId" = $1 AND a.fecha = CURRENT_DATE AND a."asignaturaId" IS NULL)::int AS "totalRegistrados"
        `,
        [empresaId],
      );

      const morosos = await this.ds.query<any[]>(`
        SELECT e.nombres || ' ' || e.apellidos AS nombre,
               e.matricula,
               g.nombre AS grado,
               s.nombre AS seccion,
               COUNT(c.id)::int AS "cuotasVencidas",
               COALESCE(SUM(c."saldoPendiente"), 0) AS saldo,
               MAX(c."diasMora")::int AS "maxDiasMora"
        FROM ed_cargos c
        JOIN ed_estudiantes e ON e.id = c."estudianteId"
        LEFT JOIN ed_matriculas m ON m."estudianteId" = e.id
          AND m."anioEscolarId" = (SELECT id FROM ed_anios_escolares WHERE "empresaId" = $1 AND "esActual" = true LIMIT 1)
          AND m.estado = 'activa'
        LEFT JOIN ed_grados g ON g.id = m."gradoId"
        LEFT JOIN ed_secciones s ON s.id = m."seccionId"
        WHERE c."empresaId" = $1 AND c.estado IN ('vencido','parcial')
        GROUP BY e.id, e.nombres, e.apellidos, e.matricula, g.nombre, s.nombre
        ORDER BY saldo DESC
        LIMIT 10
        `,
        [empresaId],
      );

      const cumpleanios = await this.ds.query<any[]>(`
        SELECT nombres || ' ' || apellidos AS nombre, matricula,
               TO_CHAR("fechaNacimiento", 'DD/MM') AS cumple,
               EXTRACT(YEAR FROM AGE("fechaNacimiento"))::int AS edad
        FROM ed_estudiantes
        WHERE "empresaId" = $1 AND estado = 'activo'
          AND TO_CHAR("fechaNacimiento", 'MM-DD') BETWEEN
              TO_CHAR(NOW(), 'MM-DD') AND
              TO_CHAR(NOW() + INTERVAL '7 days', 'MM-DD')
        ORDER BY TO_CHAR("fechaNacimiento", 'MM-DD')
        LIMIT 10
        `,
        [empresaId],
      );

      const incidentesRecientes = await this.ds.query<any[]>(`
        SELECT d.*, e.nombres || ' ' || e.apellidos AS "estudianteNombre", e.matricula
        FROM ed_disciplina d
        JOIN ed_estudiantes e ON e.id = d."estudianteId"
        WHERE d."empresaId" = $1
        ORDER BY d."createdAt" DESC
        LIMIT 5
        `,
        [empresaId],
      );

      return {
        kpis: {
          estudiantesActivos: kpis?.estudiantesActivos ?? 0,
          matriculasAnioActual: kpis?.matriculasAnioActual ?? 0,
          estudiantesMorosos: kpis?.estudiantesMorosos ?? 0,
          cobradoMes: parseFloat(kpis?.cobradoMes ?? '0'),
          carteraPendiente: parseFloat(kpis?.carteraPendiente ?? '0'),
        },
        asistenciaHoy: asistenciaHoy[0] ?? { presentes: 0, totalRegistrados: 0 },
        morosos,
        cumpleanios,
        incidentesRecientes,
      };
    } catch (err: any) {
      this.logger.error('Error en dashboard educativo', err?.message);
      return {
        kpis: { estudiantesActivos: 0, matriculasAnioActual: 0, estudiantesMorosos: 0, cobradoMes: 0, carteraPendiente: 0 },
        asistenciaHoy: { presentes: 0, totalRegistrados: 0 },
        morosos: [],
        cumpleanios: [],
        incidentesRecientes: [],
      };
    }
  }
}
