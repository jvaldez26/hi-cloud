import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  S3Client, PutObjectCommand, GetObjectCommand,
  ListObjectsV2Command, HeadBucketCommand, HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { exec } from 'child_process';
import { createHash } from 'crypto';
import { BackupRegistro } from './entities/backup-registro.entity';
import { clasificarErrorS3, type MotivoFalloS3 } from './s3-error.util';

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

  /**
   * OJO con lo que significa "EXITOSO" aquí: que el script termino sin error.
   * Nada mas. NO quiere decir que el archivo se pueda restaurar.
   *
   * Antes esto escribia `integridadVerificada: true` y `verificadoEn: new Date()`
   * sin comprobar absolutamente nada — ni el checksum contra el objeto en S3, ni
   * que el dump se abriera. El panel mostraba un tick verde con el texto
   * "SHA-256 verificado" para archivos que nadie habia abierto jamas.
   *
   * Eso es peor que no tener panel: un backup roto se veia igual que uno bueno,
   * y el dia que hiciera falta la sorpresa llegaba en el peor momento posible.
   *
   * Ahora la bandera se queda en su default (false) y solo la levanta
   * verificarRestauracion(), que restaura el dump de verdad y cuenta filas.
   */
  async registrarExito(datos: {
    s3Key: string; tamanio: string; duracion: number; checksum?: string;
  }): Promise<BackupRegistro> {
    const tipo = this.detectarTipo(datos.s3Key);
    return this.repo.save(this.repo.create({
      tipo,
      estado:           'EXITOSO',
      s3Key:            datos.s3Key,
      tamanio:          datos.tamanio,
      duracionSegundos: datos.duracion,
      checksum:         datos.checksum,
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

  // ── Vigilancia: ¿seguimos teniendo respaldos? ─────────────────────────────

  /**
   * Umbral de alarma. El backup es diario, asi que 48h son DOS ciclos perdidos:
   * lo bastante holgado para no gritar por un retraso puntual, lo bastante
   * corto para no descubrirlo un mes despues.
   */
  private static readonly HORAS_SIN_RESPALDO_CRITICO = 48;

  /**
   * Corre todos los dias a las 8 de la mañana, hora RD — a una hora en que hay
   * alguien mirando, no de madrugada.
   *
   * Hasta ahora un backup que fallaba se quedaba en /var/log/hicloud-backup.log
   * y nadie lo leia. El unico aviso era un Alert en una pantalla del panel a la
   * que ademas no se llegaba por menu.
   */
  @Cron('0 8 * * *', { timeZone: 'America/Santo_Domingo', name: 'vigilar-respaldos' })
  async vigilarRespaldos(): Promise<void> {
    const estado = await this.estadoRespaldo();
    if (!estado.critico) return;

    this.logger.error(`[Backup] ${estado.mensaje}`);
    Sentry.captureMessage(`Respaldos: ${estado.mensaje}`, {
      level: 'error',
      tags:  { area: 'backups', motivo: estado.motivo },
      extra: { horasDesdeUltimo: estado.horasDesdeUltimo, totalRegistros: estado.totalRegistros },
    });
  }

  /**
   * Estado del respaldo, para el cron y para el panel — un solo sitio que
   * decide si esto esta bien o mal.
   *
   * SIN REGISTROS ES EL CASO PEOR, no el neutro. Una tabla vacia significa que
   * o no hay respaldos, o los hay pero nadie los reporta; desde aqui las dos
   * son indistinguibles y las dos son graves. Antes la pantalla se veia igual
   * que si todo fuera bien.
   */
  async estadoRespaldo(): Promise<{
    critico: boolean;
    motivo: 'sin-registros' | 'desactualizado' | 'ultimo-fallido' | 'ok';
    mensaje: string;
    horasDesdeUltimo: number | null;
    totalRegistros: number;
    umbralHoras: number;
  }> {
    const umbralHoras = BackupService.HORAS_SIN_RESPALDO_CRITICO;
    const totalRegistros = await this.repo.count();

    if (totalRegistros === 0) {
      return {
        critico: true,
        motivo: 'sin-registros',
        mensaje:
          'No hay NINGUN registro de respaldo. Puede que el cron no este instalado ' +
          'en el servidor, o que este corriendo sin poder avisar al backend.',
        horasDesdeUltimo: null, totalRegistros: 0, umbralHoras,
      };
    }

    const ultimoExitoso = await this.repo.findOne({
      where: { estado: 'EXITOSO' },
      order: { createdAt: 'DESC' },
    });

    if (!ultimoExitoso) {
      return {
        critico: true,
        motivo: 'ultimo-fallido',
        mensaje: `Hay ${totalRegistros} registro(s) de respaldo y NINGUNO exitoso.`,
        horasDesdeUltimo: null, totalRegistros, umbralHoras,
      };
    }

    const horas = Math.floor(
      (Date.now() - new Date(ultimoExitoso.createdAt).getTime()) / 3_600_000,
    );

    if (horas >= umbralHoras) {
      return {
        critico: true,
        motivo: 'desactualizado',
        mensaje:
          `El ultimo respaldo exitoso fue hace ${horas} horas (umbral: ${umbralHoras}h). ` +
          'La base lleva mas de dos ciclos sin copia.',
        horasDesdeUltimo: horas, totalRegistros, umbralHoras,
      };
    }

    return {
      critico: false, motivo: 'ok',
      mensaje: `Ultimo respaldo hace ${horas}h.`,
      horasDesdeUltimo: horas, totalRegistros, umbralHoras,
    };
  }

  // ── Verificacion por restauracion ─────────────────────────────────────────

  /**
   * La UNICA via por la que `integridadVerificada` puede pasar a true.
   *
   * La llama verificar-backup.sh despues de restaurar el dump en una base
   * temporal y contar filas. Aqui no se restaura nada: eso vive en el script,
   * que es donde estan pg_restore y las credenciales. Este metodo solo guarda
   * el veredicto — y lo guarda igual si es negativo, porque una verificacion
   * fallida es justo lo que hay que ver en el panel.
   *
   * Si no llega `backupId` se aplica al ultimo backup exitoso: el flujo normal
   * es dump -> verificar en la misma ejecucion.
   */
  async registrarVerificacion(datos: {
    backupId?: number;
    ok: boolean;
    filas?: Record<string, { restaurado: number; produccion: number }>;
    mensaje?: string;
  }): Promise<BackupRegistro | null> {
    const backup = datos.backupId
      ? await this.repo.findOne({ where: { id: datos.backupId } })
      : await this.repo.findOne({ where: { estado: 'EXITOSO' }, order: { createdAt: 'DESC' } });

    if (!backup) {
      this.logger.warn('registrarVerificacion: no hay backup al que aplicar el veredicto');
      return null;
    }

    const ahora = new Date();
    await this.repo.update(backup.id, {
      integridadVerificada:  datos.ok,
      verificadoEn:          ahora,
      restauracionProbadaEn: ahora,
      filasVerificadas:      datos.filas ?? null,
      verificacionMensaje:   datos.ok ? null : (datos.mensaje ?? 'Verificacion fallida sin detalle'),
    });

    if (datos.ok) {
      this.logger.log(
        `[Backup] Restauracion verificada OK — id=${backup.id} key=${backup.s3Key} ` +
        `tablas=${Object.keys(datos.filas ?? {}).join(',')}`,
      );
    } else {
      // Un dump que no restaura es tan grave como no tener dump, y hasta ahora
      // no habia forma de enterarse.
      this.logger.error(
        `[Backup] LA RESTAURACION FALLO — id=${backup.id} key=${backup.s3Key}: ${datos.mensaje}`,
      );
    }

    return this.repo.findOne({ where: { id: backup.id } });
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
    // Sin registros NO hay tasa. Antes devolvia 100: cero de cero se presentaba
    // como pleno exito, y el peor estado posible salia en verde.
    const intentos  = exitosos + fallidos;
    const tasaExito = intentos > 0 ? Math.round((exitosos / intentos) * 100) : null;
    const ultimo    = items[0] ?? null;
    const horasDesde = ultimo
      ? Math.floor((Date.now() - new Date(ultimo.createdAt).getTime()) / 3_600_000)
      : null;

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      stats: { exitosos, fallidos, tasaExito, horasDesdeUltimo: horasDesde },
      s3Habilitado: this.enabled,
      // El panel necesita el veredicto, no los numeros crudos: vacio NO es verde.
      respaldo: await this.estadoRespaldo(),
    };
  }

  // ── URL de descarga temporal (15 min) ────────────────────────────────────

  async getDownloadUrl(id: number, requestedBy?: number): Promise<string | null> {
    const backup = await this.repo.findOne({ where: { id } });
    if (!backup?.s3Key || !this.s3) return null;

    // Cuando S3 no esta configurado, el script guarda "local:/tmp/..." como
    // clave. Eso NO es una clave de S3: firmarla producia una URL valida
    // apuntando a un objeto inexistente, y la descarga fallaba con un XML de
    // S3 en la cara. Peor que un boton deshabilitado, porque parecia funcionar.
    if (backup.s3Key.startsWith('local:')) {
      this.logger.warn(
        `[Backup] id=${id} solo existe en el disco de la EC2 (${backup.s3Key}) — no hay nada que descargar desde S3`,
      );
      return null;
    }

    // B-05: audit log — registrar quién descargó qué backup y cuándo
    this.logger.log(
      `[Backup] Descarga autorizada: id=${id} key=${backup.s3Key} ` +
      `by=userId:${requestedBy ?? 'unknown'}`,
    );

    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key:    backup.s3Key,
      // Sin esto el navegador recibe la clave entera como nombre
      // ("database/daily/db_20260822.dump") o intenta abrirlo en una pestaña.
      // Esta descarga es la via para sacar una copia FUERA de AWS sin SSH, asi
      // que tiene que dar un archivo con un nombre usable.
      ResponseContentDisposition:
        `attachment; filename="${backup.s3Key.split('/').pop() ?? 'backup.dump'}"`,
      ResponseContentType: 'application/octet-stream',
    });
    return getSignedUrl(this.s3, cmd, { expiresIn: 900 });
  }

  /**
   * Tamaño REAL del objeto en S3, en bytes.
   *
   * `tamanio` en la fila viene de `du -sh` y es una cadena redondeada ("42M"):
   * sirve para mirarla, no para comprobar que una descarga llego completa. Esto
   * da el numero exacto contra el que comparar el archivo descargado.
   */
  async tamanioRealEnS3(id: number): Promise<{ bytes: number; key: string } | null> {
    const backup = await this.repo.findOne({ where: { id } });
    if (!backup?.s3Key || !this.s3 || backup.s3Key.startsWith('local:')) return null;
    try {
      const res = await this.s3.send(new HeadObjectCommand({
        Bucket: this.bucket, Key: backup.s3Key,
      }));
      return { bytes: res.ContentLength ?? 0, key: backup.s3Key };
    } catch (e: any) {
      this.logger.warn(`[Backup] HeadObject fallo para id=${id}: ${e.message}`);
      return null;
    }
  }

  // ── Estado de S3 ─────────────────────────────────────────────────────────

  async verificarS3(): Promise<{
    ok: boolean; bucket: string; habilitado: boolean;
    motivo?: MotivoFalloS3; detalle?: string;
  }> {
    if (!this.s3 || !this.bucket) return { ok: false, bucket: '', habilitado: false };
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { ok: true, bucket: this.bucket, habilitado: true };
    } catch (e: any) {
      // El `catch {}` a secas tiraba el error a la basura y el panel solo sabia
      // decir "S3 no responde". Costo tres rondas de diagnostico averiguar que
      // el bucket estaba perfecto y lo que faltaban eran CREDENCIALES en el
      // backend — justo la respuesta que este catch tenia en la mano y tiro.
      const motivo = clasificarErrorS3(e);
      this.logger.warn(
        `[Backup] HeadBucket fallo sobre ${this.bucket}: motivo=${motivo} ` +
        `name=${e?.name} status=${e?.$metadata?.httpStatusCode}`,
      );
      return {
        ok: false, bucket: this.bucket, habilitado: true,
        motivo, detalle: `${e?.name ?? 'Error'}${e?.$metadata?.httpStatusCode ? ` (HTTP ${e.$metadata.httpStatusCode})` : ''}`,
      };
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
