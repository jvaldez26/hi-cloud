import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  S3Client, PutObjectCommand, GetObjectCommand,
  ListObjectsV2Command, HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { exec } from 'child_process';
import { createHash } from 'crypto';
import { BackupRegistro } from './entities/backup-registro.entity';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private s3: S3Client | null = null;
  private bucket: string;
  private enabled: boolean;

  constructor(
    @InjectRepository(BackupRegistro)
    private readonly repo: Repository<BackupRegistro>,
    private readonly config: ConfigService,
  ) {
    const region = config.get<string>('AWS_REGION', 'us-east-2');
    this.bucket  = config.get<string>('AWS_S3_BACKUP_BUCKET', config.get<string>('AWS_S3_BUCKET', ''));
    this.enabled = !!this.bucket;

    if (this.enabled) {
      this.s3 = new S3Client({ region });
      this.logger.log(`Backup S3 habilitado — bucket: ${this.bucket}`);
    } else {
      this.logger.warn('Backup S3 no configurado — establece AWS_S3_BACKUP_BUCKET en .env');
    }
  }

  // ── Registrar backup exitoso (llamado por el script) ──────────────────────

  async registrarExito(datos: {
    s3Key: string; tamanio: string; duracion: number; checksum?: string;
  }): Promise<BackupRegistro> {
    const tipo = this.detectarTipo(datos.s3Key);
    return this.repo.save(this.repo.create({
      tipo,
      estado:               'EXITOSO',
      s3Key:                datos.s3Key,
      tamanio:              datos.tamanio,
      duracionSegundos:     datos.duracion,
      checksum:             datos.checksum,
      integridadVerificada: true,
      verificadoEn:         new Date(),
    }));
  }

  // ── Registrar backup fallido (llamado por el script) ──────────────────────

  async registrarFallo(datos: { mensaje: string; tipo?: string }): Promise<BackupRegistro> {
    return this.repo.save(this.repo.create({
      tipo:         (datos.tipo ?? 'daily') as any,
      estado:       'FALLIDO',
      errorMensaje: datos.mensaje,
    }));
  }

  // ── Listar backups ────────────────────────────────────────────────────────

  async listar(page = 1, limit = 20) {
    const [items, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      take:  limit,
      skip:  (page - 1) * limit,
    });

    // Stats rápidas
    const exitosos  = await this.repo.count({ where: { estado: 'EXITOSO' } });
    const fallidos  = await this.repo.count({ where: { estado: 'FALLIDO' } });
    const tasaExito = total > 0 ? Math.round((exitosos / (exitosos + fallidos)) * 100) : 100;
    const ultimo    = items[0] ?? null;
    const horasDesde = ultimo
      ? Math.floor((Date.now() - new Date(ultimo.createdAt).getTime()) / 3_600_000)
      : null;

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      stats: { exitosos, fallidos, tasaExito, horasDesdeUltimo: horasDesde },
      s3Habilitado: this.enabled,
    };
  }

  // ── URL de descarga temporal (15 min) ────────────────────────────────────

  async getDownloadUrl(id: number, requestedBy?: number): Promise<string | null> {
    const backup = await this.repo.findOne({ where: { id } });
    if (!backup?.s3Key || !this.s3) return null;

    // B-05: audit log — registrar quién descargó qué backup y cuándo
    this.logger.log(
      `[Backup] Descarga autorizada: id=${id} key=${backup.s3Key} ` +
      `by=userId:${requestedBy ?? 'unknown'}`,
    );

    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: backup.s3Key });
    return getSignedUrl(this.s3, cmd, { expiresIn: 900 });
  }

  // ── Estado de S3 ─────────────────────────────────────────────────────────

  async verificarS3(): Promise<{ ok: boolean; bucket: string; habilitado: boolean }> {
    if (!this.s3 || !this.bucket) return { ok: false, bucket: '', habilitado: false };
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { ok: true, bucket: this.bucket, habilitado: true };
    } catch {
      return { ok: false, bucket: this.bucket, habilitado: true };
    }
  }

  // ── Listar backups en S3 ─────────────────────────────────────────────────

  async listarEnS3(): Promise<{ key: string; size: number; lastModified: Date }[]> {
    if (!this.s3 || !this.bucket) return [];
    try {
      const res = await this.s3.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: 'database/',
        MaxKeys: 50,
      }));
      return (res.Contents ?? []).map(o => ({
        key:          o.Key ?? '',
        size:         o.Size ?? 0,
        lastModified: o.LastModified ?? new Date(),
      }));
    } catch (e: any) {
      this.logger.warn('No se pudo listar S3:', e.message);
      return [];
    }
  }

  // ── Trigger manual (ejecuta el script en EC2) ────────────────────────────

  async triggerManual(userId: number): Promise<{ mensaje: string }> {
    const registro = await this.repo.save(this.repo.create({
      tipo: 'manual', estado: 'EN_PROGRESO', iniciadoPor: userId,
    }));

    const scriptPath = process.env.BACKUP_SCRIPT_PATH ?? '/home/ubuntu/scripts/backup-hicloud.sh';

    // Fire-and-forget — el script notifica al completar
    exec(scriptPath, { timeout: 900_000 }, (err, stdout, stderr) => {
      if (err) {
        this.logger.error(`Backup manual falló (id=${registro.id}): ${err.message}`);
        this.repo.update(registro.id, { estado: 'FALLIDO', errorMensaje: err.message });
      } else {
        this.logger.log(`Backup manual completado (id=${registro.id})`);
      }
    });

    return { mensaje: `Backup manual iniciado (id: ${registro.id}). Se notificará al completar.` };
  }

  // ── Privado ───────────────────────────────────────────────────────────────

  private detectarTipo(s3Key: string): 'daily' | 'weekly' | 'monthly' | 'manual' {
    if (s3Key.includes('/monthly/')) return 'monthly';
    if (s3Key.includes('/weekly/'))  return 'weekly';
    if (s3Key.includes('/manual/'))  return 'manual';
    return 'daily';
  }
}
