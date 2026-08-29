import {
  Controller, Post, Get, Body, Headers, HttpCode, HttpStatus,
  UnauthorizedException, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, IsBoolean, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { BackupService } from './backup.service';
import { claveInternaValida } from './clave-interna.util';

/**
 * Rutas que llama backup-hicloud.sh — un SCRIPT, no una persona con sesión.
 *
 * ── POR QUÉ ESTO ES UN CONTROLADOR APARTE ──────────────────────────────────
 *
 * Vivían dentro de SuperAdminController, que lleva `@UseGuards(SuperAdminGuard)`
 * a nivel de CLASE. En Nest los guards de clase corren antes que el handler, y
 * lo primero que hace ese guard es:
 *
 *     const token = extractJwtFromRequest(req);
 *     if (!token) throw new UnauthorizedException('Token requerido');
 *
 * `extractJwtFromRequest` solo mira la cookie `access_token` y el header
 * `Authorization: Bearer`. NO mira `x-internal-key`. El script manda la clave
 * interna y ninguna sesión, así que el guard devolvía 401 y la comprobación de
 * `INTERNAL_API_KEY` —que estaba dentro del handler— no llegaba a ejecutarse
 * jamás.
 *
 * Consecuencia: los respaldos corrían bien y se subían a S3, pero el reporte al
 * backend se rechazaba siempre. `backup_registros` quedaba vacía y el panel
 * llevaba meses diciendo "Último backup: Nunca". Todo correcto salvo la única
 * parte que nos permitía saberlo.
 *
 * La frontera del guard tiene que coincidir con el modelo de autenticación. Por
 * eso estas tres rutas salen del controlador del panel en vez de añadir
 * excepciones dentro: un controlador con dos modelos de auth mezclados es
 * exactamente lo que vuelve a romperse.
 *
 * Las rutas NO cambian (`/api/v1/admin/backups/internal/*`): el script sigue
 * llamando igual.
 */

class BackupSuccessDto {
  @IsString() @IsNotEmpty() archivo!: string;
  @IsString() @IsNotEmpty() tamanio!: string;
  @IsInt() @Type(() => Number) duracion!: number;
  @IsOptional() @IsString()    checksum?: string;

  /**
   * Fila que hay que CERRAR, cuando el respaldo lo pidio el boton manual.
   *
   * Lo manda el script desde `BACKUP_REGISTRO_ID`, que le pasa
   * `triggerManual()` por entorno. Ausente en el cron: ahi no hay fila previa
   * y el reporte da de alta una nueva.
   */
  @IsOptional() @IsInt() @Type(() => Number) registroId?: number;
}

class BackupAlertDto {
  @IsString() @IsNotEmpty() mensaje!: string;
  @IsOptional() @IsString() tipo?: string;
}

class BackupVerificacionDto {
  /** Si falta, se aplica al último backup exitoso. */
  @IsOptional() @IsInt() @Type(() => Number) backupId?: number;

  @IsBoolean() @Type(() => Boolean) ok!: boolean;

  /** { tabla: { restaurado, produccion } } — ver la entidad. */
  @IsOptional() @IsObject() filas?: Record<string, { restaurado: number; produccion: number }>;

  @IsOptional() @IsString() mensaje?: string;

  /** Cuanto tardo la verificacion completa, en segundos. */
  @IsOptional() @IsInt() @Type(() => Number) duracion?: number;
}

@ApiTags('Super Admin')
@Controller('admin/backups/internal')
export class BackupInternalController {
  constructor(private readonly backupSvc: BackupService) {}

  /**
   * Clave inválida o ausente → 401 de verdad.
   *
   * Antes se devolvía `{ error: 'No autorizado' }` con HTTP 200. El script usa
   * `curl -sf`, que solo falla ante códigos de error: con un 200 y el error en
   * el cuerpo, curl daba éxito y el script se quedaba creyendo que había
   * notificado. Otro fallo silencioso encima del que ya había.
   */
  private exigirClave(key?: string): void {
    if (!claveInternaValida(key)) {
      throw new UnauthorizedException('Clave interna inválida o ausente');
    }
  }

  @Post('success')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Interno] Registrar backup exitoso — lo llama el script bash' })
  success(@Headers('x-internal-key') key: string, @Body() dto: BackupSuccessDto) {
    this.exigirClave(key);
    return this.backupSvc.registrarExito({
      s3Key:      dto.archivo,
      tamanio:    dto.tamanio,
      duracion:   dto.duracion,
      checksum:   dto.checksum,
      registroId: dto.registroId,
    });
  }

  @Post('alert')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Interno] Registrar backup fallido — lo llama el script bash' })
  alert(@Headers('x-internal-key') key: string, @Body() dto: BackupAlertDto) {
    this.exigirClave(key);
    return this.backupSvc.registrarFallo({ mensaje: dto.mensaje, tipo: dto.tipo });
  }

  /**
   * Veredicto de la restauración de prueba. Se acepta también el NEGATIVO: un
   * dump que no restaura es tan grave como no tener dump.
   */
  @Post('verificacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Interno] Registrar el resultado de la restauración de prueba' })
  verificacion(@Headers('x-internal-key') key: string, @Body() dto: BackupVerificacionDto) {
    this.exigirClave(key);
    return this.backupSvc.registrarVerificacion({
      backupId:         dto.backupId,
      ok:               dto.ok,
      filas:            dto.filas,
      mensaje:          dto.mensaje,
      duracionSegundos: dto.duracion,
    });
  }

  /**
   * Qué respaldo hay que verificar. Lo pregunta verificar-backup.sh ANTES de
   * bajar nada de S3.
   *
   * Existe porque la verificación pasó a probar el archivo REAL que está en S3
   * en vez de un dump nuevo hecho en el momento. Para eso el script necesita
   * tres cosas que solo sabe el backend: qué objeto bajar (`s3Key`), contra qué
   * contrastarlo (`checksum`) y en qué fila clavar el veredicto (`id`).
   *
   * 404 cuando no hay ningún respaldo subido a S3. Es un caso legítimo, no un
   * error: el script lo distingue y termina sin marcar nada como fallido —
   * "todavía no hay respaldo" no es lo mismo que "el respaldo no sirve", y de
   * la tabla vacía ya avisa `estadoRespaldo()` por su cuenta.
   */
  @Get('ultimo')
  @ApiOperation({ summary: '[Interno] Último respaldo subido a S3 — lo consulta verificar-backup.sh' })
  async ultimo(@Headers('x-internal-key') key: string) {
    this.exigirClave(key);
    const backup = await this.backupSvc.ultimoParaVerificar();
    if (!backup) {
      throw new NotFoundException('No hay ningún respaldo exitoso subido a S3 que verificar');
    }
    return backup;
  }
}
