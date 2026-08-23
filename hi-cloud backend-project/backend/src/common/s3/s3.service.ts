import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-providers';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import * as path   from 'path';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private client: S3Client;
  private bucket: string;
  private region: string;
  private enabled: boolean;

  /**
   * Perfil de credenciales usado para construir el S3Client.
   * Expuesto como readonly para que los tests puedan verificar
   * que no se usa el proveedor global AWS_PROFILE del proceso.
   */
  readonly credentialProfile: string;

  constructor(private config: ConfigService) {
    this.region  = config.get<string>('AWS_REGION', 'us-east-2');
    this.bucket  = config.get<string>('AWS_S3_BUCKET', '');
    this.enabled = !!this.bucket;

    // Perfil explícito — nunca depende del AWS_PROFILE global del proceso.
    // Dos buckets con requisitos de seguridad distintos (media vs backups)
    // no pueden compartir un único AWS_PROFILE: el cliente que no corresponde
    // se autenticaría contra el bucket equivocado si la variable cambia.
    this.credentialProfile = config.get<string>('AWS_S3_PROFILE', 'hicloud-media');
    const credFile = config.get<string>('AWS_SHARED_CREDENTIALS_FILE', '');

    this.client = new S3Client({
      region: this.region,
      credentials: fromIni({
        profile: this.credentialProfile,
        ...(credFile ? { filepath: credFile } : {}),
      }),
    });

    if (this.enabled) {
      this.logger.log(`S3 habilitado — bucket: ${this.bucket} perfil: ${this.credentialProfile}`);
    } else {
      this.logger.warn('AWS_S3_BUCKET vacío — upload() sin bucketOverride retornará null');
    }
  }

  get isEnabled(): boolean { return this.enabled; }

  /**
   * Sube un archivo a S3 y retorna la URL pública.
   * bucketOverride permite usar un bucket distinto al configurado en AWS_S3_BUCKET.
   */
  async upload(
    buffer:       Buffer,
    originalName: string,
    contentType:  string,
    folder        = 'uploads',
    empresaId?:   number,
    bucketOverride?: string,
  ): Promise<string | null> {
    const bucket = bucketOverride ?? this.bucket;
    if (!bucket) return null;

    const ext  = path.extname(originalName).toLowerCase();
    const hash = crypto.randomBytes(8).toString('hex');
    const key  = `${folder}/${empresaId ? empresaId + '/' : ''}${hash}${ext}`;

    await this.client.send(new PutObjectCommand({
      Bucket:       bucket,
      Key:          key,
      Body:         buffer,
      ContentType:  contentType,
      CacheControl: 'public, max-age=31536000',
    }));

    const url = `https://${bucket}.s3.${this.region}.amazonaws.com/${key}`;
    this.logger.log(`Archivo subido a S3: ${key} (bucket: ${bucket})`);
    return url;
  }

  /**
   * Sube un archivo a S3 y retorna la KEY del objeto, no la URL completa.
   *
   * Usar en lugar de upload() para datos que se van a guardar en BD:
   * la key sobrevive a cambios de bucket, región y esquema de acceso.
   * La URL se genera on-demand con getSignedUrl() cuando se necesita mostrar.
   */
  async uploadKey(
    buffer:       Buffer,
    originalName: string,
    contentType:  string,
    folder        = 'uploads',
    empresaId?:   number,
    bucketOverride?: string,
  ): Promise<string | null> {
    const url = await this.upload(buffer, originalName, contentType, folder, empresaId, bucketOverride);
    if (!url) return null;
    // Extraer la key desde la URL: https://bucket.s3.region.amazonaws.com/<key>
    return new URL(url).pathname.slice(1);
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
