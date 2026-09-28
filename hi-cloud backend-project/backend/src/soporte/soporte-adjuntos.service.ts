import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
// file-type@16 (última con require() en CJS — v17+ es ESM-only y este backend
// no lo es). El nombre exportado es `fromBuffer`, no `fileTypeFromBuffer`
// (ese nombre solo existe en la API de v18+).
import { fromBuffer } from 'file-type';
import sharp from 'sharp';
import { S3Service } from '../common/s3/s3.service';
import { SoporteTicketAdjunto } from './entities/soporte-ticket-adjunto.entity';

const TIPOS_PERMITIDOS = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_ADJUNTOS_POR_TICKET = 5;
export const MAX_BYTES_POR_ADJUNTO   = 5 * 1024 * 1024;
const ANCHO_MAX_PX = 2000;

export interface ArchivoSubido {
  buffer:       Buffer;
  originalname: string;
  mimetype:     string;
  size:         number;
}

export interface AdjuntoConUrl {
  id:           number;
  tipoMime:     string;
  tamanioBytes: number;
  url:          string | null;
}

@Injectable()
export class SoporteAdjuntosService {
  private readonly logger = new Logger(SoporteAdjuntosService.name);

  constructor(
    @InjectRepository(SoporteTicketAdjunto) private repo: Repository<SoporteTicketAdjunto>,
    private s3: S3Service,
  ) {}

  /**
   * Valida por el contenido REAL del archivo (magic bytes vía file-type),
   * nunca por la extensión ni por el Content-Type que manda el navegador —
   * ambos los elige quien sube el archivo, así que un .exe renombrado a
   * "foto.jpg" con Content-Type falseado pasaría cualquier chequeo que
   * confiara en ellos.
   *
   * Redimensiona a un máximo de ANCHO_MAX_PX y re-codifica la imagen, lo que
   * de paso descarta TODO metadato EXIF (ubicación GPS incluida): sharp solo
   * conserva metadata si se llama a .withMetadata(), que nunca se llama
   * aquí. .rotate() sin argumentos aplica la orientación EXIF a los píxeles
   * ANTES de descartarla, para no dejar fotos de retrato tumbadas de lado.
   */
  private async procesarImagen(archivo: ArchivoSubido): Promise<{ buffer: Buffer; mime: string; ext: string }> {
    if (archivo.size > MAX_BYTES_POR_ADJUNTO) {
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
      if (detectado.mime === 'image/png')       buffer = await imagen.png().toBuffer();
      else if (detectado.mime === 'image/webp') buffer = await imagen.webp().toBuffer();
      else                                        buffer = await imagen.jpeg({ quality: 85 }).toBuffer();
      return { buffer, mime: detectado.mime, ext: detectado.ext };
    } catch {
      throw new BadRequestException(`No se pudo procesar "${archivo.originalname}" — el archivo parece dañado`);
    }
  }

  /**
   * Valida y procesa TODOS los archivos antes de subir ninguno — así una
   * imagen inválida rechaza el envío completo (el usuario lo ve como un
   * solo error), en vez de dejar el ticket con adjuntos a medias.
   */
  async procesarYGuardar(
    ticketId:  number,
    empresaId: number | null,
    archivos:  ArchivoSubido[],
  ): Promise<SoporteTicketAdjunto[]> {
    if (archivos.length === 0) return [];
    if (archivos.length > MAX_ADJUNTOS_POR_TICKET) {
      throw new BadRequestException(`Máximo ${MAX_ADJUNTOS_POR_TICKET} imágenes por ticket`);
    }

    const procesados = await Promise.all(archivos.map(a => this.procesarImagen(a)));

    const filas: SoporteTicketAdjunto[] = [];
    for (const p of procesados) {
      const ruta = await this.s3.uploadKey(
        p.buffer,
        `adjunto.${p.ext}`,
        p.mime,
        `soporte-tickets/${ticketId}`,
        empresaId ?? undefined,
      );
      if (!ruta) {
        this.logger.error(`No se pudo subir adjunto a S3 para ticket #${ticketId} (¿AWS_S3_BUCKET sin configurar?)`);
        throw new BadRequestException('No se pudo guardar la imagen — intenta de nuevo o escríbenos por WhatsApp');
      }
      const fila = this.repo.create({
        empresaId: empresaId ?? undefined,
        ticketId,
        ruta,
        tipoMime:     p.mime,
        tamanioBytes: p.buffer.length,
      });
      filas.push(await this.repo.save(fila));
    }
    return filas;
  }

  async porTicket(ticketId: number): Promise<SoporteTicketAdjunto[]> {
    return this.repo.find({ where: { ticketId, isActive: true }, order: { id: 'ASC' } });
  }

  /**
   * Un solo adjunto, verificando que pertenezca al ticket dado — 404 si no
   * existe o pertenece a otro ticket. Nunca revela cuál de las dos cosas es.
   */
  async unoDeTicket(ticketId: number, adjuntoId: number): Promise<SoporteTicketAdjunto> {
    const adjunto = await this.repo.findOne({ where: { id: adjuntoId, ticketId, isActive: true } });
    if (!adjunto) throw new NotFoundException('Adjunto no encontrado');
    return adjunto;
  }

  /** Firma URLs de acceso temporal — nunca se persiste una URL de S3 directa. */
  async conUrlFirmada(adjuntos: SoporteTicketAdjunto[], expiresIn = 900): Promise<AdjuntoConUrl[]> {
    return Promise.all(adjuntos.map(async a => ({
      id:           a.id,
      tipoMime:     a.tipoMime,
      tamanioBytes: a.tamanioBytes,
      url:          await this.s3.getSignedUrl(a.ruta, expiresIn),
    })));
  }
}
