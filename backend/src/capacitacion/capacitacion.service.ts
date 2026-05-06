import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Curso } from './entities/curso.entity';
import { SesionCapacitacion } from './entities/sesion-capacitacion.entity';
import { RegistroCapacitacion } from './entities/registro-capacitacion.entity';
import { TenantService } from '../tenant/tenant.service';

interface CreateCursoDto {
  nombre: string; descripcion?: string; categoria?: string;
  instructor?: string; duracionHoras?: number; modalidad?: string;
}

interface CreateSesionDto {
  cursoId: number; fecha: string; hora?: string; lugar?: string;
  modalidad?: string; capacidadMaxima?: number; notas?: string;
}

interface RegistroAsistenciaItem {
  empleadoId: number; asistio: boolean; calificacion?: number; comentarios?: string;
}

@Injectable()
export class CapacitacionService {
  constructor(
    @InjectRepository(Curso)               private cursoRepo:   Repository<Curso>,
    @InjectRepository(SesionCapacitacion)  private sesionRepo:  Repository<SesionCapacitacion>,
    @InjectRepository(RegistroCapacitacion) private registroRepo: Repository<RegistroCapacitacion>,
    private tenantService: TenantService,
  ) {}

  // ─── Cursos ──────────────────────────────────────────────────────────────────

  listarCursos() {
    return this.cursoRepo.find({ where: { activo: true }, order: { nombre: 'ASC' } });
  }

  crearCurso(dto: CreateCursoDto) {
    return this.cursoRepo.save(this.cursoRepo.create(dto));
  }

  async actualizarCurso(id: number, dto: Partial<CreateCursoDto>) {
    await this.cursoRepo.update(id, dto);
    return this.cursoRepo.findOneByOrFail({ id });
  }

  async eliminarCurso(id: number) {
    await this.cursoRepo.update(id, { activo: false });
  }

  // ─── Sesiones ────────────────────────────────────────────────────────────────

  async listarSesiones() {
    const sesiones = await this.sesionRepo.find({ order: { fecha: 'DESC' } });
    if (sesiones.length === 0) return [];

    const cursoIds = [...new Set(sesiones.map(s => s.cursoId))];
    const cursos   = await this.cursoRepo.find({ where: { id: In(cursoIds) } });
    const cursoMap = new Map(cursos.map(c => [c.id, c]));

    return sesiones.map(s => ({ ...s, curso: cursoMap.get(s.cursoId) }));
  }

  async crearSesion(dto: CreateSesionDto) {
    const curso = await this.cursoRepo.findOneBy({ id: dto.cursoId });
    if (!curso) throw new NotFoundException('Curso no encontrado');
    return this.sesionRepo.save(this.sesionRepo.create(dto));
  }

  async actualizarSesion(id: number, dto: Partial<CreateSesionDto> & { estado?: string }) {
    await this.sesionRepo.update(id, dto);
    return this.sesionRepo.findOneByOrFail({ id });
  }

  // ─── Registros de Asistencia ─────────────────────────────────────────────────

  listarRegistros(sesionId: number) {
    return this.registroRepo.find({ where: { sesionId }, order: { createdAt: 'ASC' } });
  }

  async registrarAsistencia(sesionId: number, registros: RegistroAsistenciaItem[]) {
    const results: RegistroCapacitacion[] = [];
    for (const r of registros) {
      const aprobado = r.calificacion != null ? r.calificacion >= 70 : false;
      const existing = await this.registroRepo.findOneBy({ sesionId, empleadoId: r.empleadoId });
      if (existing) {
        await this.registroRepo.update(existing.id, { ...r, aprobado });
        results.push({ ...existing, ...r, aprobado } as RegistroCapacitacion);
      } else {
        const saved = await this.registroRepo.save(
          this.registroRepo.create({ sesionId, ...r, aprobado }),
        );
        results.push(saved);
      }
    }
    return results;
  }

  async emitirCertificado(id: number) {
    await this.registroRepo.update(id, { certificadoEmitido: true });
    return this.registroRepo.findOneByOrFail({ id });
  }

  async resumen() {
    const cursos       = await this.cursoRepo.count({ where: { activo: true } });
    const sesiones     = await this.sesionRepo.count();
    const certificados = await this.registroRepo.count({ where: { certificadoEmitido: true } });
    return { cursos, sesiones, certificados };
  }
}
