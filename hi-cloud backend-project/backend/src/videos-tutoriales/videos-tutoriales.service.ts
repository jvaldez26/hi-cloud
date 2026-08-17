import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoTutorial } from './videos-tutoriales.entity';
import { CreateVideoTutorialDto } from './dto/create-video-tutorial.dto';
import { UpdateVideoTutorialDto } from './dto/update-video-tutorial.dto';
import { ReorderVideosDto } from './dto/reorder-videos.dto';

@Injectable()
export class VideosTutorialesService {
  constructor(
    @InjectRepository(VideoTutorial)
    private readonly repo: Repository<VideoTutorial>,
  ) {}

  /** SuperAdmin: lista todos (activos e inactivos), ordenados */
  findAll(): Promise<VideoTutorial[]> {
    return this.repo.find({ order: { orden: 'ASC', id: 'ASC' } });
  }

  /**
   * Endpoint público para usuarios autenticados.
   * Devuelve solo los activos como mapa {modulo → datos}.
   * El frontend lo cachea 5 min y VideoTutorialButton lo consulta.
   */
  async findPublico(): Promise<Record<string, {
    titulo: string;
    proveedor: 'youtube' | 'vimeo';
    videoId: string;
    duracionSegundos: number | null;
  }>> {
    const rows = await this.repo.find({
      where: { activo: true },
      order: { orden: 'ASC' },
      select: ['modulo', 'titulo', 'proveedor', 'videoId', 'duracionSegundos'],
    });
    return Object.fromEntries(
      rows.map(r => [r.modulo, {
        titulo:             r.titulo,
        proveedor:          r.proveedor,
        videoId:            r.videoId,
        duracionSegundos:   r.duracionSegundos,
      }]),
    );
  }

  async create(dto: CreateVideoTutorialDto): Promise<VideoTutorial> {
    const existing = await this.repo.findOne({ where: { modulo: dto.modulo } });
    if (existing) {
      throw new ConflictException(`Ya existe un video para el módulo "${dto.modulo}"`);
    }
    const video = this.repo.create({
      ...dto,
      orden:  dto.orden  ?? 0,
      activo: dto.activo ?? true,
    });
    return this.repo.save(video);
  }

  async update(id: number, dto: UpdateVideoTutorialDto): Promise<VideoTutorial> {
    const video = await this.repo.findOne({ where: { id } });
    if (!video) throw new NotFoundException(`Video #${id} no encontrado`);

    // Si cambia el modulo, verificar que no exista otro con el mismo modulo
    if (dto.modulo && dto.modulo !== video.modulo) {
      const conflict = await this.repo.findOne({ where: { modulo: dto.modulo } });
      if (conflict) {
        throw new ConflictException(`Ya existe un video para el módulo "${dto.modulo}"`);
      }
    }

    Object.assign(video, dto);
    return this.repo.save(video);
  }

  async remove(id: number): Promise<void> {
    const video = await this.repo.findOne({ where: { id } });
    if (!video) throw new NotFoundException(`Video #${id} no encontrado`);
    await this.repo.remove(video);
  }

  /** Actualiza el orden de múltiples videos en una sola operación */
  async reorder(dto: ReorderVideosDto): Promise<void> {
    await Promise.all(
      dto.items.map(({ id, orden }) =>
        this.repo.update(id, { orden }),
      ),
    );
  }

  async toggleActivo(id: number): Promise<VideoTutorial> {
    const video = await this.repo.findOne({ where: { id } });
    if (!video) throw new NotFoundException(`Video #${id} no encontrado`);
    video.activo = !video.activo;
    return this.repo.save(video);
  }
}
