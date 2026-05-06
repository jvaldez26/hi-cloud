import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Empleado } from '../nomina/entities/empleado.entity';
import { TenantService } from '../tenant/tenant.service';

// ── Tabla ISR 2024 — Ley 11-92 RD (art. 296, modificado por Ley 253-12) ────────
// Las tasas se aplican sobre el salario neto anual (después de AFP y SFS)
const TABLA_ISR_2024 = [
  { desde: 0,          hasta: 416_220.01, tasa: 0,    exceso: 0 },
  { desde: 416_220.01, hasta: 624_329.00, tasa: 0.15, exceso: 0 },
  { desde: 624_329.01, hasta: 867_123.00, tasa: 0.20, exceso: 31_216.20 },
  { desde: 867_123.01, hasta: Infinity,   tasa: 0.25, exceso: 79_776.60 },
];

export interface DetalleISR {
  empleadoId:         number;
  nombre:             string;
  salarioBruto:       number;
  deduccionAfp:       number;  // 2.87% empleado
  deduccionSfs:       number;  // 3.04% empleado
  salarioNetaAnual:   number;
  isrAnual:           number;
  isrMensual:         number;
  tramo:              string;
  tasaEfectiva:       number;
}

@Injectable()
export class IsrService {
  // ── Tasas TSS empleado 2024 (Ley 87-01) ──────────────────────────────────────
  private static readonly AFP_EMP = 0.0287; // 2.87%
  private static readonly SFS_EMP = 0.0304; // 3.04%

  constructor(
    @InjectRepository(Empleado) private empRepo: Repository<Empleado>,
    private dataSource:  DataSource,
    private tenantSvc:   TenantService,
  ) {}

  // ─── Cálculo ISR para un salario mensual ─────────────────────────────────────

  calcularISR(salarioBrutoMensual: number): Omit<DetalleISR, 'empleadoId' | 'nombre'> {
    const salarioBruto     = Number(salarioBrutoMensual);
    const deduccionAfp     = +(salarioBruto * IsrService.AFP_EMP).toFixed(2);
    const deduccionSfs     = +(salarioBruto * IsrService.SFS_EMP).toFixed(2);
    const salarioNetoMens  = salarioBruto - deduccionAfp - deduccionSfs;
    const salarioNetaAnual = +(salarioNetoMens * 12).toFixed(2);

    // Aplicar tabla progresiva
    let isrAnual = 0;
    let tramo    = 'Exento';

    for (const t of TABLA_ISR_2024) {
      if (salarioNetaAnual > t.desde && salarioNetaAnual <= t.hasta) {
        if (t.tasa > 0) {
          isrAnual = t.exceso + (salarioNetaAnual - t.desde) * t.tasa;
          tramo    = `${(t.tasa * 100).toFixed(0)}% sobre excedente de RD$ ${t.desde.toLocaleString('es-DO')}`;
        }
        break;
      }
    }

    const isrMensual    = +(isrAnual / 12).toFixed(2);
    const tasaEfectiva  = salarioNetaAnual > 0
      ? +((isrAnual / salarioNetaAnual) * 100).toFixed(2)
      : 0;

    return {
      salarioBruto,
      deduccionAfp,
      deduccionSfs,
      salarioNetaAnual,
      isrAnual:        +isrAnual.toFixed(2),
      isrMensual,
      tramo,
      tasaEfectiva,
    };
  }

  // ─── ISR de todos los empleados ──────────────────────────────────────────────

  async calcularPlantilla() {
    const empresaId = this.tenantSvc.getEmpresaId();
    const empleados = await this.empRepo.find({
      where: { empresaId, isActive: true },
      order: { nombre: 'ASC' },
    });

    const detalles: DetalleISR[] = empleados.map(emp => ({
      empleadoId: emp.id,
      nombre:     `${emp.nombre} ${emp.apellido}`,
      ...this.calcularISR(Number(emp.salarioBase)),
    }));

    const totalIsrMensual  = detalles.reduce((s, d) => s + d.isrMensual,  0);
    const totalIsrAnual    = detalles.reduce((s, d) => s + d.isrAnual,    0);
    const exentos          = detalles.filter(d => d.isrMensual === 0).length;
    const gravados         = detalles.filter(d => d.isrMensual >  0).length;

    return {
      empleados: detalles,
      resumen: {
        totalEmpleados:   detalles.length,
        exentos,
        gravados,
        totalIsrMensual:  +totalIsrMensual.toFixed(2),
        totalIsrAnual:    +totalIsrAnual.toFixed(2),
        periodoCalculo:   new Date().toISOString().split('T')[0],
        leyAplicable:     'Ley 11-92 RD modificada por Ley 253-12 — Tabla vigente 2024',
      },
    };
  }

  // ─── Simulador individual ─────────────────────────────────────────────────────

  simular(salarioMensual: number) {
    return {
      salarioMensual: Number(salarioMensual),
      ...this.calcularISR(Number(salarioMensual)),
      tablaReferencia: TABLA_ISR_2024.map(t => ({
        desde:    t.desde,
        hasta:    t.hasta === Infinity ? null : t.hasta,
        tasa:     `${(t.tasa * 100).toFixed(0)}%`,
        exceso:   t.exceso,
      })),
      notas: [
        'Deducciones de AFP (2.87%) y SFS (3.04%) se aplican antes de calcular ISR.',
        'El ISR mensual es el resultado de dividir el ISR anual entre 12.',
        'Tasas aplicables según Ley 11-92 RD — Consulte al contador para casos especiales.',
      ],
    };
  }
}
