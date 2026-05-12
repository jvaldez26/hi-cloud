import {
  Controller, Get, Post, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsInt, IsPositive, IsUrl } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import { DocumentosService } from './documentos.service';
import { TipoEntidadDoc } from './entities/documento.entity';

class SubirDocumentoDto {
  @IsEnum(TipoEntidadDoc)
  tipoEntidad!: TipoEntidadDoc;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  entidadId?: number;

  @IsString()
  nombre!: string;

  @IsOptional() @IsString()
  tipoMime?: string;

  @IsOptional() @IsString()
  extension?: string;

  @IsOptional() @IsInt() @Type(() => Number)
  tamanioKb?: number;

  @IsString()
  url!: string;

  @IsOptional() @IsString()
  descripcion?: string;
}

@ApiTags('Gestión de Documentos')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', description: 'ID de la empresa activa', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
@Controller('documentos')
export class DocumentosController {
  constructor(private readonly svc: DocumentosService) {}

  @Get('resumen')
  @ApiOperation({ summary: 'Resumen de documentos por tipo de entidad' })
  resumen() {
    return this.svc.resumen();
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar todos los documentos, filtrar por ?tipoEntidad=factura' })
  listar(@Query('tipoEntidad') tipoEntidad?: TipoEntidadDoc) {
    return this.svc.listarGeneral(tipoEntidad);
  }

  @Get(':tipo/:entidadId')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Documentos de un registro específico (ej: /factura/123)' })
  listarPorEntidad(
    @Param('tipo')        tipo:      TipoEntidadDoc,
    @Param('entidadId', ParseIntPipe) entidadId: number,
  ) {
    return this.svc.listarPorEntidad(tipo, entidadId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar nuevo documento (URL de un archivo ya almacenado)' })
  subir(@Body() dto: SubirDocumentoDto, @GetUser() user: User) {
    return this.svc.subir({
      ...dto,
      subidoPorId:     user.id,
      nombreSubidoPor: user.nombre,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar documento (soft delete)' })
  eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.eliminar(id);
  }
}
