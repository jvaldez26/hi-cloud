import {
  Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Query,
  UseGuards, UseInterceptors, UploadedFile, UploadedFiles, HttpCode, HttpStatus,
  BadRequestException, Ip, Headers,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, IsEmail, IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import type { User } from '../users/users.entity';
import { ActivacionEcfService } from './activacion-ecf.service';
import { SuperAdminGuard } from '../super-admin/super-admin.guard';
import { EstadoSolicitudActivacion } from './entities/solicitud-activacion-ecf.entity';
import { exigirArchivo } from './archivo-faltante.util';

/**
 * Tipo estructural del archivo subido. El repo no instala @types/multer, asi
 * que se declara aqui igual que en productos.controller.ts.
 */
interface ArchivoSubido {
  buffer:       Buffer;
  mimetype:     string;
  originalname: string;
  size:         number;
  fieldname:    string;
}

/** 5 MB. Un PFX real son unos pocos KB; esto ya es holgado. */
const MAX_PFX = 5 * 1024 * 1024;
/** 8 MB para el comprobante — una foto de recibo cabe de sobra. */
const MAX_COMPROBANTE = 8 * 1024 * 1024;

const EXT_PFX = /\.(pfx|p12)$/i;
const MIME_COMPROBANTE = /^(image\/(jpeg|png|webp|heic)|application\/pdf)$/;

class CrearSolicitudDto {
  @IsOptional() @IsString() contactoNombre?: string;
  @IsOptional() @IsEmail()  contactoEmail?: string;
  @IsOptional() @IsString() contactoTelefono?: string;
  @IsOptional() @IsString() notas?: string;
  /** Clave del PFX. Se usa para abrirlo y se descarta — no se guarda. */
  @IsOptional() @IsString() clavePfx?: string;
}

class CambiarEstadoDto {
  @IsEnum(EstadoSolicitudActivacion) estado!: EstadoSolicitudActivacion;
  @IsOptional() @IsString() motivo?: string;
}

/**
 * Activación de facturación electrónica — lado del cliente.
 *
 * NOTA SOBRE EL CERTIFICADO: los endpoints que reciben un PFX usan
 * `memoryStorage()` EXPLÍCITO. Multer 2.x ya usa memoria por defecto cuando no
 * se le pasa `storage` ni `dest`, pero un default es justo lo que cambia en
 * silencio en una actualización. El PFX no puede tocar disco ni un instante.
 */
@ApiTags('Activación e-CF')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('activacion-ecf')
export class ActivacionEcfController {
  constructor(private readonly svc: ActivacionEcfService) {}

  @Get('tarifas')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Tarifas vigentes de implementación — el frontend no las hardcodea' })
  tarifas() { return this.svc.tarifas(); }

  /**
   * Veredicto único: si el módulo se ve y en qué modo.
   *
   * Lo consultan el MENÚ y la PANTALLA. Si cada uno decidiera por su cuenta
   * podrían discrepar, y el usuario acabaría viendo una entrada que lleva a
   * algo que no le toca.
   */
  @Get('estado')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Si el módulo debe verse y en qué modo — lo usan el menú y la pantalla' })
  estado() { return this.svc.estado(); }

  @Get('mi-solicitud')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Solicitud de activación de esta empresa, si existe' })
  miSolicitud() { return this.svc.miSolicitud(); }

  /**
   * Valida el certificado y devuelve el precio, SIN crear nada.
   *
   * El cliente ve el monto antes de enviar y cambia al subir el PFX. El archivo
   * se descarta en cuanto se leen los metadatos.
   */
  //
  // ESTE ENDPOINT ES UN ORACULO DE CLAVES: recibe un PFX y una contrasena y
  // responde si es correcta. Con un certificado robado se podrian probar claves
  // por fuerza bruta. Tres frenos:
  //   1. Sesion obligatoria (JwtAuthGuard a nivel de clase) y rol admin/contador.
  //   2. @Throttle por IP — el mismo mecanismo que el login.
  //   3. Contador por empresa+IP con bloqueo progresivo, y rastro de cada fallo.
  @Post('validar-certificado')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @UseInterceptors(FileInterceptor('certificado', {
    storage: memoryStorage(),
    limits:  { fileSize: MAX_PFX },
    fileFilter: (_req, file, cb) => {
      if (!EXT_PFX.test(file.originalname)) {
        return cb(new BadRequestException('El certificado debe ser un archivo .pfx o .p12'), false);
      }
      cb(null, true);
    },
  }))
  @ApiOperation({ summary: 'Valida un PFX en memoria y devuelve el precio. NO almacena el certificado' })
  validarCertificado(
    @UploadedFile() archivo: ArchivoSubido,
    @Body('clavePfx') clavePfx: string,
    @GetUser() user: User,
    @Ip() ip: string,
    @Headers('content-type') contentType: string,
  ) {
    exigirArchivo(archivo, contentType, 'certificado');
    return this.svc.validarCertificado(archivo.buffer, clavePfx ?? '', user.id, ip);
  }

  /**
   * Crea la solicitud. El certificado y el comprobante son opcionales: se puede
   * solicitar hoy y pagar mañana.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @UseInterceptors(FileFieldsInterceptor(
    [{ name: 'certificado', maxCount: 1 }, { name: 'comprobante', maxCount: 1 }],
    {
      storage: memoryStorage(),
      limits:  { fileSize: MAX_COMPROBANTE },
      fileFilter: (_req, file, cb) => {
        if (file.fieldname === 'certificado' && !EXT_PFX.test(file.originalname)) {
          return cb(new BadRequestException('El certificado debe ser .pfx o .p12'), false);
        }
        if (file.fieldname === 'comprobante' && !MIME_COMPROBANTE.test(file.mimetype)) {
          return cb(new BadRequestException('El comprobante debe ser una imagen o un PDF'), false);
        }
        cb(null, true);
      },
    },
  ))
  @ApiOperation({ summary: 'Crear solicitud de activación con el precio congelado' })
  async crear(
    @Body() dto: CrearSolicitudDto,
    @GetUser() user: User,
    @UploadedFiles() archivos: { certificado?: ArchivoSubido[]; comprobante?: ArchivoSubido[] },
    @Ip() ip: string,
  ) {
    const pfx = archivos?.certificado?.[0];
    if (pfx && pfx.size > MAX_PFX) {
      throw new BadRequestException('El certificado supera el tamaño permitido.');
    }

    const solicitud = await this.svc.crear({
      usuarioId:        user.id,
      contactoNombre:   dto.contactoNombre,
      contactoEmail:    dto.contactoEmail,
      contactoTelefono: dto.contactoTelefono,
      notas:            dto.notas,
      pfx:              pfx?.buffer,
      clavePfx:         dto.clavePfx,
      ip,
    });

    const comprobante = archivos?.comprobante?.[0];
    if (comprobante?.buffer) {
      await this.svc.adjuntarComprobante(
        solicitud.id, comprobante.buffer, comprobante.originalname, comprobante.mimetype,
      );
    }

    return this.svc.miSolicitud();
  }

  /** Adjuntar el comprobante después: se solicita hoy y se paga mañana. */
  @Post(':id/comprobante')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @UseInterceptors(FileInterceptor('comprobante', {
    storage: memoryStorage(),
    limits:  { fileSize: MAX_COMPROBANTE },
    fileFilter: (_req, file, cb) => {
      if (!MIME_COMPROBANTE.test(file.mimetype)) {
        return cb(new BadRequestException('El comprobante debe ser una imagen o un PDF'), false);
      }
      cb(null, true);
    },
  }))
  @ApiOperation({ summary: 'Adjuntar el comprobante de pago a una solicitud existente' })
  adjuntar(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() archivo: ArchivoSubido,
    @Headers('content-type') contentType: string,
  ) {
    exigirArchivo(archivo, contentType, 'comprobante');
    return this.svc.adjuntarComprobante(id, archivo.buffer, archivo.originalname, archivo.mimetype);
  }
}

/**
 * Lado plataforma. Guard propio: aquí se ven TODAS las empresas, así que la
 * frontera de acceso es distinta y por eso es un controlador aparte.
 */
@ApiTags('Super Admin')
@ApiBearerAuth('access-token')
@UseGuards(SuperAdminGuard)
@Controller('admin/activacion-ecf')
export class ActivacionEcfAdminController {
  constructor(private readonly svc: ActivacionEcfService) {}

  @Get()
  @ApiOperation({ summary: 'Solicitudes de activación de todas las empresas' })
  listar(@Query('estado') estado?: string) { return this.svc.listarTodas(estado); }

  @Get(':id/comprobante')
  @ApiOperation({ summary: 'URL firmada del comprobante — 15 min, nunca pública' })
  async comprobante(@Param('id', ParseIntPipe) id: number) {
    const url = await this.svc.urlComprobante(id);
    return { url };
  }

  @Patch(':id/estado')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambiar el estado. Activar NO configura MSeller: eso es manual' })
  cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoDto,
    @GetUser() admin: any,
  ) {
    return this.svc.cambiarEstado(id, dto.estado, admin?.id, dto.motivo);
  }
}
