import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EvaluacionEmpleado, EstadoEvaluacion, PeriodoEvaluacion,
} from './entities/evaluacion.entity';
import { Empleado } from '../nomina/entities/empleado.entity';
import { TenantService } from '../tenant/tenant.service';

// Criterios estándar de evaluación HiCloud ERP
export const CRITERIOS_ESTANDAR = [
  { key: 'puntualidad',    label: 'Puntualidad y asistencia' },
  { key: 'calidad',        label: 'Calidad del trabajo' },
  { key: 'productividad',  label: 'Productividad' },
  { key: 'actitud',        label: 'Actitud y disposición' },
  { key: 'trabajo_equipo', label: 'Trabajo en equipo' },
  { key: 'comunicacion',   label: 'Comunicación' },
  { key: 'iniciativa',     label: 'Iniciativa e innovación' },
  { key: 'conocimiento',   label: 'Conocimiento del cargo' },
];

@Injectable()
export class EvaluacionesService {
  constructor(
    @InjectRepository(EvaluacionEmpleado) private evalRepo:    Repository<EvaluacionEmpleado>,
    @InjectRepository(Empleado)           private empRepo:     Repository<Empleado>,
    private tenantService: TenantService,
  ) {}

  async crear(dto: any, evaluadorId: number) {
    const promedio = this.calcularPromedio(dto.criterios ?? {});
    return this.evalRepo.save(this.evalRepo.create({
      ...dto,
      evaluadorId,
      empresaId:           this.tenantService.getEmpresaId(),
      calificacionGeneral: promedio,
    }));
  }

  async listar(anio?: number, periodo?: PeriodoEvaluacion, empleadoId?: number) {
    const qb = this.evalRepo.createQueryBuilder('e')
      .leftJoinAndSelect('e.empleado',  'emp')
      .leftJoinAndSelect('e.evaluador', 'ev')
      .where('e.isActive = :a AND e.empresaId = :eid', { a: true, eid: this.tenantService.getEmpresaId() });

    if (anio)       qb.andWhere('e.anio = :y',          { y: anio });
    if (periodo)    qb.andWhere('e.periodo = :p',        { p: periodo });
    if (empleadoId) qb.andWhere('e.empleadoId = :eid',   { eid: empleadoId });

    return qb.orderBy('e.createdAt', 'DESC').getMany();
  }

  async findById(id: number): Promise<EvaluacionEmpleado> {
    const e = await this.evalRepo.findOne({ where: { id, empresaId: this.tenantService.getEmpresaId(), isActive: true }, relations: ['empleado', 'evaluador'] });
    if (!e) throw new NotFoundException(`Evaluación #${id} no encontrada`);
    return e;
  }

  async actualizar(id: number, dto: any) {
    await this.findById(id);
    const promedio = dto.criterios ? this.calcularPromedio(dto.criterios) : undefined;
    await this.evalRepo.update(id, {
      ...dto,
      ...(promedio !== undefined ? { calificacionGeneral: promedio } : {}),
    });
    return this.findById(id);
  }

  async completar(id: number) {
    await this.findById(id);
    await this.evalRepo.update(id, { estado: EstadoEvaluacion.COMPLETADA });
    return this.findById(id);
  }

  async eliminar(id: number) {
    await this.evalRepo.update(id, { isActive: false });
    return { ok: true };
  }

  // ── Resumen por equipo ────────────────────────────────────────────────────

  async getResumenEquipo(anio: number, periodo?: PeriodoEvaluacion) {
    const evaluaciones = await this.listar(anio, periodo);
    if (evaluaciones.length === 0) return { empleados: [], promedio: 0, top: [], mejora: [] };

    // Agrupar por empleado — promedio general
    const porEmpleado = evaluaciones.reduce((acc, e) => {
      const eid = e.empleadoId;
      if (!acc[eid]) {
        acc[eid] = {
          empleadoId:  eid,
          nombre:      `${e.empleado?.nombre ?? ''} ${e.empleado?.apellido ?? ''}`.trim(),
          cargo:       (e.empleado as any)?.cargo ?? '—',
          evaluaciones: [],
          promedio:    0,
        };
      }
      acc[eid].evaluaciones.push(Number(e.calificacionGeneral ?? 0));
      return acc;
    }, {} as Record<number, any>);

    const empleados = Object.values(porEmpleado).map((emp: any) => ({
      ...emp,
      promedio: +(emp.evaluaciones.reduce((s: number, v: number) => s + v, 0) / emp.evaluaciones.length).toFixed(2),
    }));

    const promedioEquipo = +(empleados.reduce((s, e) => s + e.promedio, 0) / empleados.length).toFixed(2);
    const top3    = [...empleados].sort((a, b) => b.promedio - a.promedio).slice(0, 3);
    const mejora3 = [...empleados].sort((a, b) => a.promedio - b.promedio).slice(0, 3);

    return { empleados, promedio: promedioEquipo, top: top3, mejora: mejora3 };
  }

  async getHistoricoEmpleado(empleadoId: number) {
    const evaluaciones = await this.evalRepo.find({
      where: { empleadoId, isActive: true, estado: EstadoEvaluacion.COMPLETADA },
      order: { anio: 'ASC', semestre: 'ASC' },
    });
    return evaluaciones.map(e => ({
      label:              `${e.periodo} ${e.anio}${e.semestre > 1 ? `-${e.semestre}` : ''}`,
      calificacion:       Number(e.calificacionGeneral ?? 0),
      criterios:          e.criterios,
    }));
  }

  getCriterios() { return CRITERIOS_ESTANDAR; }

  private calcularPromedio(criterios: Record<string, number>): number {
    const vals = Object.values(criterios).filter(v => typeof v === 'number');
    if (vals.length === 0) return 0;
    return +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2);
  }
}
