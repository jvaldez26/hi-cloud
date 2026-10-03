import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { fromBuffer } from 'file-type';
import sharp from 'sharp';
import { S3Service } from '../../common/s3/s3.service';
import { CwTurnoFoto } from '../entities/cw-turno-foto.entity';

const TIPOS_PERMITIDOS = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_FOTOS_POR_TURNO = 6;
export const MAX_BYTES_POR_FOTO = 5 * 1024 * 1024;
const ANCHO_MAX_PX = 2000;

export interface ArchivoSubido {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface FotoConUrl {
  id: number;
  tipoMime: string;
  tamanioBytes: number;
  url: string | null;
}

/** Mismo patrón que SoporteAdjuntosService: valida por magic bytes (nunca
 *  por extensión/Content-Type), re-codifica con sharp (descarta EXIF) y
 *  guarda solo la key de S3 — la URL se firma on-demand. */
@Injectable()
export class CwTurnoFotosService {
  private readonly logger = new Logger(CwTurnoFotosService.name);

  constructor(
    @InjectRepository(CwTurnoFoto) private repo: Repository<CwTurnoFoto>,
    private s3: S3Service,
  ) {}

  private async procesarImagen(archivo: ArchivoSubido): Promise<{ buffer: Buffer; mime: string; ext: string }> {
    if (archivo.size > MAX_BYTES_POR_FOTO) {
      throw new BadRequestException(`"${archivo.originalname}" pesa más de 5 MB`);
    }

    const detectado = await fromBuffer(archivo.buffer);
    if (!detectado || !TIPOS_PERMITIDOS.has(detectado.mime)) {
      throw new BadRequestException(
        `"${archivo.originalname}" no es una imagen PNG, JPG o WEBP válida — el contenido del archivo no coincide con ninguno de esos formatos`,
      );
    }

    let imagen: sharp.Sharp;
    let metadata: sharp.Metadata;
    try {
      imagen = sharp(archivo.buffer).rotate();
      metadata = await imagen.metadata();
    } catch {
      throw new BadRequestException(`No se pudo procesar "${archivo.originalname}" — el archivo parece dañado`);
    }

    if (metadata.width && metadata.width > ANCHO_MAX_PX) {
      imagen = imagen.resize({ width: ANCHO_MAX_PX, withoutEnlargement: true });
    }

    try {
      let buffer: Buffer;
      if (detectado.mime === 'image/png') buffer = await imagen.png().toBuffer();
      else if (detectado.mime === 'image/webp') buffer = await imagen.webp().toBuffer();
      else buffer = await imagen.jpeg({ quality: 85 }).toBuffer();
      return { buffer, mime: detectado.mime, ext: detectado.ext };
    } catch {
      throw new BadRequestException(`No se pudo procesar "${archivo.originalname}" — el archivo parece dañado`);
    }
  }

  async procesarYGuardar(turnoId: number, empresaId: number, archivos: ArchivoSubido[]): Promise<CwTurnoFoto[]> {
    if (archivos.length === 0) return [];
    const existentes = await this.repo.count({ where: { turnoId } });
    if (existentes + archivos.length > MAX_FOTOS_POR_TURNO) {
      throw new BadRequestException(`Máximo ${MAX_FOTOS_POR_TURNO} fotos por turno`);
    }

    const procesados = await Promise.all(archivos.map(a => this.procesarImagen(a)));

    const filas: CwTurnoFoto[] = [];
    for (const p of procesados) {
      const ruta = await this.s3.uploadKey(p.buffer, `foto.${p.ext}`, p.mime, `car-wash/${turnoId}`, empresaId);
      if (!ruta) {
        this.logger.error(`No se pudo subir foto a S3 para turno #${turnoId} (¿AWS_S3_BUCKET sin configurar?)`);
        throw new BadRequestException('No se pudo guardar la foto — intenta de nuevo');
      }
      const fila = this.repo.create({ empresaId, turnoId, ruta, tipoMime: p.mime, tamanioBytes: p.buffer.length });
      filas.push(await this.repo.save(fila));
    }
    return filas;
  }

  async porTurno(empresaId: number, turnoId: number): Promise<CwTurnoFoto[]> {
    return this.repo.find({ where: { empresaId, turnoId }, order: { id: 'ASC' } });
  }

  async conUrlFirmada(fotos: CwTurnoFoto[], expiresIn = 900): Promise<FotoConUrl[]> {
    return Promise.all(fotos.map(async f => ({
      id: f.id, tipoMime: f.tipoMime, tamanioBytes: f.tamanioBytes,
      url: await this.s3.getSignedUrl(f.ruta, expiresIn),
    })));
  }

  async unaDeTurno(empresaId: number, turnoId: number, fotoId: number): Promise<CwTurnoFoto> {
    const foto = await this.repo.findOne({ where: { id: fotoId, turnoId, empresaId } });
    if (!foto) throw new NotFoundException('Foto no encontrada');
    return foto;
  }
}
