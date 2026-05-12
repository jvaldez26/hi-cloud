import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import * as path   from 'path';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private client: S3Client | null = null;
  private bucket: string;
  private region: string;
  private enabled: boolean;

  constructor(private config: ConfigService) {
    this.region  = config.get<string>('AWS_REGION', 'us-east-2');
    this.bucket  = config.get<string>('AWS_S3_BUCKET', '');
    this.enabled = !!this.bucket;

    if (this.enabled) {
      this.client = new S3Client({ region: this.region });
      this.logger.log(`S3 habilitado — bucket: ${this.bucket}`);
    } else {
      this.logger.warn('S3 no configurado (AWS_S3_BUCKET vacío) — archivos no se suben');
    }
  }

  get isEnabled(): boolean { return this.enabled; }

  /**
   * Sube un archivo a S3 y retorna la URL pública.
   * Si S3 no está configurado, retorna null.
   */
  async upload(
    buffer:      Buffer,
    originalName: string,
    contentType: string,
    folder = 'uploads',
    empresaId?: number,
  ): Promise<string | null> {
    if (!this.client || !this.bucket) return null;

    const ext      = path.extname(originalName).toLowerCase();
    const hash     = crypto.randomBytes(8).toString('hex');
    const key      = `${folder}/${empresaId ? empresaId + '/' : ''}${hash}${ext}`;

    await this.client.send(new PutObjectCommand({
      Bucket:       this.bucket,
      Key:          key,
      Body:         buffer,
      ContentType:  contentType,
      CacheControl: 'public, max-age=31536000', // 1 año para assets estáticos
    }));

    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    this.logger.log(`Archivo subido a S3: ${key}`);
    return url;
  }

  /** Sube PDF de documento — carpeta privada, acceso por URL firmada */
  async uploadPDF(
    buffer:    Buffer,
    filename:  string,
    empresaId: number,
  ): Promise<string | null> {
    if (!this.client || !this.bucket) return null;

    const key = `pdfs/${empresaId}/${filename}`;
    await this.client.send(new PutObjectCommand({
      Bucket:      this.bucket,
      Key:         key,
      Body:        buffer,
      ContentType: 'application/pdf',
    }));

    this.logger.log(`PDF subido a S3: ${key}`);
    return key; // Retornar key para generar URL firmada cuando se necesite
  }

  /** Genera URL firmada con expiración (para PDFs privados) */
  async getSignedUrl(key: string, expiresIn = 3600): Promise<string | null> {
    if (!this.client || !this.bucket) return null;

    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn });
  }

  /** Elimina un archivo de S3 */
  async delete(keyOrUrl: string): Promise<void> {
    if (!this.client || !this.bucket) return;

    // Extraer key si se pasa una URL completa
    const key = keyOrUrl.startsWith('https://')
      ? keyOrUrl.split('.amazonaws.com/')[1]
      : keyOrUrl;

    if (!key) return;

    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    this.logger.log(`Archivo eliminado de S3: ${key}`);
  }
}
