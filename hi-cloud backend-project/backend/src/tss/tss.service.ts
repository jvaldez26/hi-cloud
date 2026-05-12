import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Empleado } from '../nomina/entities/empleado.entity';
import { NominaPeriodo } from '../nomina/entities/nomina-periodo.entity';
import { NominaLinea } from '../nomina/entities/nomina-linea.entity';
import { TenantService } from '../tenant/tenant.service';

// ── Tasas TSS Ley 87-01 (República Dominicana) ────────────────────────────────
// Actualizado 2024 — fuente CNSS
const TASAS_TSS = {
  SFS: {
    empleado:  0.0304, // 3.04% Seguro Familiar de Salud
    empleador: 0.0709, // 7.09%
  },
  AFP: {
    empleado:  0.0287, // 2.87% Pensión
    empleador: 0.0710, // 7.10%
  },
  SRL: {
    empleado:  0.00,
    empleador: 0.0110, // 1.10% Seguro de Riesgos Laborales
  },
};

const SALARIO_COTIZABLE_MAXIMO = 118_432.00; // tope mensual 2024 (20 salarios mínimos)

@Injectable()
export class TSSService {
  constructor(
    @InjectRepository(Empleado)      private empRepo:     Repository<Empleado>,
    @InjectRepository(NominaPeriodo) private periodoRepo: Repository<NominaPeriodo>,
    @InjectRepository(NominaLinea)   private lineaRepo:   Repository<NominaLinea>,
    private tenantService: TenantService,
  ) {}

  // ── Cálculo individual ─────────────────────────────────────────────────────

  calcularAportes(salarioBruto: number) {
    const base = Math.min(salarioBruto, SALARIO_COTIZABLE_MAXIMO);

    return {
      base,
      SFS: {
        empleado:  +(base * TASAS_TSS.SFS.empleado).toFixed(2),
        empleador: +(base * TASAS_TSS.SFS.empleador).toFixed(2),
        total:     +(base * (TASAS_TSS.SFS.empleado + TASAS_TSS.SFS.empleador)).toFixed(2),
      },
      AFP: {
        empleado:  +(base * TASAS_TSS.AFP.empleado).toFixed(2),
        empleador: +(base * TASAS_TSS.AFP.empleador).toFixed(2),
        total:     +(base * (TASAS_TSS.AFP.empleado + TASAS_TSS.AFP.empleador)).toFixed(2),
      },
      SRL: {
        empleado:  0,
        empleador: +(base * TASAS_TSS.SRL.empleador).toFixed(2),
        total:     +(base * TASAS_TSS.SRL.empleador).toFixed(2),
      },
      totalEmpleado:  +(base * (TASAS_TSS.SFS.empleado + TASAS_TSS.AFP.empleado)).toFixed(2),
      totalEmpleador: +(base * (TASAS_TSS.SFS.empleador + TASAS_TSS.AFP.empleador + TASAS_TSS.SRL.empleador)).toFixed(2),
    };
  }

  // ── Reporte TSS mensual ────────────────────────────────────────────────────

  async getReporteMensual(mes: number, anio: number) {
    // Obtener todos los empleados activos
    const empleados = await this.empRepo.find({
      where: { isActive: true, estado: 'activo' as any },
      order: { cedula: 'ASC' },
    });

    // Buscar período de nómina del mes (si existe)
    const periodos = await this.periodoRepo.find({
      where: { empresaId: this.tenantService.getEmpresaId(), isActive: true },
    });

    const periodoMes = periodos.find(p => {
      const f = new Date(p.fechaInicio);
      return f.getMonth() + 1 === mes && f.getFullYear() === anio;
    });

    // Cargar TODAS las líneas del período en una sola query — elimina N+1
    const lineasDelPeriodo = periodoMes
      ? await this.lineaRepo.find({ where: { periodoId: periodoMes.id, isActive: true } })
      : [];
    const lineasMap = new Map(lineasDelPeriodo.map(l => [l.empleadoId, l]));

    const filas = empleados.map((emp) => {
      // Salario efectivo del período (de nómina o del salario base)
      let salarioEfectivo = Number(emp.salarioBase);
      const linea = lineasMap.get(emp.id);
      if (linea) salarioEfectivo = Number(linea.salarioBruto);

      const aportes = this.calcularAportes(salarioEfectivo);

      return {
        cedula:         emp.cedula,
        nombre:         `${emp['nombre']} ${emp['apellido'] ?? ''}`.trim(),
        cargo:          emp['cargo'] ?? '—',
        salarioBruto:   salarioEfectivo,
        baseCotizable:  aportes.base,
        // SFS
        sfsEmpleado:    aportes.SFS.empleado,
        sfsEmpleador:   aportes.SFS.empleador,
        // AFP
        afpEmpleado:    aportes.AFP.empleado,
        afpEmpleador:   aportes.AFP.empleador,
        // SRL
        srlEmpleador:   aportes.SRL.empleador,
        // Totales
        totalEmpleado:  aportes.totalEmpleado,
        totalEmpleador: aportes.totalEmpleador,
        totalGeneral:   aportes.totalEmpleado + aportes.totalEmpleador,
      };
    });

    const totales = {
      empleados:      filas.length,
      salarioBruto:   filas.reduce((s, f) => s + f.salarioBruto, 0),
      sfsEmpleado:    filas.reduce((s, f) => s + f.sfsEmpleado, 0),
      sfsEmpleador:   filas.reduce((s, f) => s + f.sfsEmpleador, 0),
      afpEmpleado:    filas.reduce((s, f) => s + f.afpEmpleado, 0),
      afpEmpleador:   filas.reduce((s, f) => s + f.afpEmpleador, 0),
      srlEmpleador:   filas.reduce((s, f) => s + f.srlEmpleador, 0),
      totalEmpleado:  filas.reduce((s, f) => s + f.totalEmpleado, 0),
      totalEmpleador: filas.reduce((s, f) => s + f.totalEmpleador, 0),
      totalGeneral:   filas.reduce((s, f) => s + f.totalGeneral, 0),
    };

    return {
      periodo:        { mes, anio },
      tasas:          TASAS_TSS,
      tope:           SALARIO_COTIZABLE_MAXIMO,
      filas,
      totales,
    };
  }

  // ── Resumen anual TSS ──────────────────────────────────────────────────────

  async getResumenAnual(anio: number) {
    const meses = await Promise.all(
      Array.from({ length: 12 }, (_, i) => this.getReporteMensual(i + 1, anio)),
    );
    return {
      anio,
      meses: meses.map(m => ({
        mes:            m.periodo.mes,
        empleados:      m.totales.empleados,
        salarioBruto:   m.totales.salarioBruto,
        totalEmpleado:  m.totales.totalEmpleado,
        totalEmpleador: m.totales.totalEmpleador,
        totalGeneral:   m.totales.totalGeneral,
      })),
      totalAnual: {
        totalEmpleado:  meses.reduce((s, m) => s + m.totales.totalEmpleado, 0),
        totalEmpleador: meses.reduce((s, m) => s + m.totales.totalEmpleador, 0),
        totalGeneral:   meses.reduce((s, m) => s + m.totales.totalGeneral, 0),
      },
    };
  }
}
