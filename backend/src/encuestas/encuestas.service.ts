import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Encuesta } from './entities/encuesta.entity';
import { RespuestaEncuesta } from './entities/respuesta-encuesta.entity';
import { TenantService } from '../tenant/tenant.service';

interface CreateEncuestaDto {
  titulo: string; tipo?: string; descripcion?: string;
  preguntas?: Array<{ id: string; texto: string; tipo: string; opciones?: string[] }>;
}

interface RegistrarRespuestaDto {
  encuestaId?: number; tokenPublico?: string; clienteId?: number;
  nombreRespondente?: string; puntuacion?: number;
  respuestas?: Record<string, string | number>; comentarios?: string;
}

@Injectable()
export class EncuestasService {
  constructor(
    @InjectRepository(Encuesta)          private encuestaRepo:  Repository<Encuesta>,
    @InjectRepository(RespuestaEncuesta) private respuestaRepo: Repository<RespuestaEncuesta>,
    private tenantService: TenantService,
  ) {}

  listar() {
    return this.encuestaRepo.find({ order: { createdAt: 'DESC' } });
  }

  crear(dto: CreateEncuestaDto) {
    const tokenPublico = randomBytes(16).toString('hex');
    return this.encuestaRepo.save(this.encuestaRepo.create({ ...dto, tokenPublico }));
  }

  async actualizar(id: number, dto: Partial<CreateEncuestaDto> & { activa?: boolean }) {
    await this.encuestaRepo.update(id, dto);
    return this.encuestaRepo.findOneByOrFail({ id });
  }

  async eliminar(id: number) {
    await this.encuestaRepo.update(id, { activa: false });
  }

  listarRespuestas(encuestaId: number) {
    return this.respuestaRepo.find({ where: { encuestaId }, order: { createdAt: 'DESC' } });
  }

  async registrarRespuesta(dto: RegistrarRespuestaDto) {
    const encuesta = dto.tokenPublico
      ? await this.encuestaRepo.findOneBy({ tokenPublico: dto.tokenPublico })
      : await this.encuestaRepo.findOneBy({ id: dto.encuestaId! });

    if (!encuesta)       throw new NotFoundException('Encuesta no encontrada');
    if (!encuesta.activa) throw new NotFoundException('Encuesta inactiva');

    return this.respuestaRepo.save(
      this.respuestaRepo.create({ ...dto, encuestaId: encuesta.id }),
    );
  }

  async metricas(id: number) {
    const encuesta = await this.encuestaRepo.findOneByOrFail({ id });
    const respuestas = await this.respuestaRepo.find({ where: { encuestaId: id } });
    const total = respuestas.length;

    if (total === 0) return { total: 0, npsScore: null, csatPromedio: null, distribucion: {} };

    if (encuesta.tipo === 'nps') {
      const promotores  = respuestas.filter(r => (r.puntuacion ?? 0) >= 9).length;
      const detractores = respuestas.filter(r => (r.puntuacion ?? 0) <= 6).length;
      const npsScore    = Math.round(((promotores - detractores) / total) * 100);
      const distribucion: Record<string, number> = {};
      for (let i = 0; i <= 10; i++) {
        distribucion[String(i)] = respuestas.filter(r => r.puntuacion === i).length;
      }
      return { total, npsScore, promotores, detractores, neutros: total - promotores - detractores, distribucion };
    }

    if (encuesta.tipo === 'csat') {
      const suma = respuestas.reduce((s, r) => s + (r.puntuacion ?? 0), 0);
      const csatPromedio = +(suma / total).toFixed(1);
      const distribucion: Record<string, number> = {};
      for (let i = 1; i <= 5; i++) {
        distribucion[String(i)] = respuestas.filter(r => r.puntuacion === i).length;
      }
      return { total, csatPromedio, distribucion };
    }

    return { total };
  }
}
