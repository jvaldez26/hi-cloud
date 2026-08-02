import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  IsString, IsOptional, IsInt, IsPositive, IsNumber, Min, IsDateString,
  IsIn, IsArray, ValidateNested, IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/users.entity';
import {
  ConteoInventarioService, CreateConteoInput,
  DigitarLineaResult, LoteResultado,
} from './conteo-inventario.service';
import { ConteoInventario } from './entities/conteo-inventario.entity';

// ── DTOs ──────────────────────────────────────────────────────────────────────

// 'proveedor' y 'ciclico_abc' no están implementados — no exponerlos en el DTO
const TIPOS_CONTEO   = ['total', 'selectivo', 'categoria', 'marca', 'ubicacion'] as const;
const MODALIDADES    = ['manual', 'guiado'] as const;
const UMBRAL_TIPOS   = ['porcentaje', 'unidades', 'valor'] as const;

export class CreateConteoDto implements CreateConteoInput {
  @IsString()
  nombre!: string;

  @IsInt() @IsPositive() @Type(() => Number)
  almacenId!: number;

  @IsIn(TIPOS_CONTEO)
  tipo!: ConteoInventario['tipo'];

  @IsIn(MODALIDADES)
  modalidad!: ConteoInventario['modalidad'];

  @IsIn(UMBRAL_TIPOS)
  umbralTipo!: ConteoInventario['umbralTipo'];

  // maxDecimalPlaces: 4 — crítico, ya costó una semana este error
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  umbralValor!: number;

  @IsOptional() @IsObject()
  filtros?: Record<string, unknown>;

  @IsOptional() @IsString()
  notas?: string;
}

export class IniciarConteoDto {
  @IsOptional() @IsDateString()
  fechaCorteConteo?: string;
}

export class DigitarLineaDto {
  @IsInt() @IsPositive() @Type(() => Number)
  lineaId!: number;

  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  cantidadContada!: number;
}

export class DigitarLoteItem {
  @IsInt() @IsPositive() @Type(() => Number)
  lineaId!: number;

  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  cantidadContada!: number;
}

export class DigitarLoteDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DigitarLoteItem)
  lineas!: DigitarLoteItem[];
}

export class CapturarRecuentoDto {
  @IsInt() @IsPositive() @Type(() => Number)
  lineaId!: number;

  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Type(() => Number)
  cantidadRecuento!: number;
}

class ListarConteosQuery {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;

  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  limit?: number;

  @IsOptional() @IsString()
  estado?: string;

  @IsOptional() @IsInt() @IsPositive() @Type(() => Number)
  almacenId?: number;
}

// ── Controller ────────────────────────────────────────────────────────────────

@ApiTags('Conteo Físico de Inventario')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'X-Empresa-ID', required: true })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('conteo-inventario')
export class ConteoInventarioController {
  constructor(private readonly svc: ConteoInventarioService) {}

  // ── Consultas (lectura abierta a VIEWER) ───────────────────────────────────

  @Get('resumen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Totales de conteos agrupados por estado' })
  resumen() {
    return this.svc.resumen();
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Listar conteos con paginación y filtros opcionales' })
  listar(@Query() q: ListarConteosQuery) {
    return this.svc.listar({ page: q.page, limit: q.limit, estado: q.estado, almacenId: q.almacenId });
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VIEWER)
  @ApiOperation({ summary: 'Detalle del conteo con todas sus líneas' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Crear hoja de conteo y snapshot de líneas' })
  crear(@Body() dto: CreateConteoDto, @GetUser() user: User) {
    return this.svc.crear(dto, user.id);
  }

  @Patch(':id/iniciar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Cambiar borrador → en_conteo; fija fechaCorteConteo (default: ahora)' })
  iniciar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IniciarConteoDto,
  ) {
    const corte = dto.fechaCorteConteo ? new Date(dto.fechaCorteConteo) : undefined;
    return this.svc.iniciar(id, corte);
  }

  // ── Digitación ─────────────────────────────────────────────────────────────

  @Patch(':id/linea')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.EMPLEADO)
  @ApiOperation({ summary: 'Digitar cantidad física de una línea; retorna diferencia y si requiere recuento' })
  digitarLinea(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DigitarLineaDto,
    @GetUser() user: User,
  ): Promise<DigitarLineaResult> {
    return this.svc.digitarLinea(id, dto, user.id);
  }

  @Post(':id/lote')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.EMPLEADO)
  @ApiOperation({ summary: 'Digitar múltiples líneas; procesa cada una independientemente' })
  digitarLote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DigitarLoteDto,
    @GetUser() user: User,
  ): Promise<LoteResultado[]> {
    return this.svc.digitarLote(id, dto.lineas, user.id);
  }

  @Patch(':id/recuento')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.EMPLEADO)
  @ApiOperation({ summary: 'Capturar recuento (segunda verificación) de línea en_recuento' })
  capturarRecuento(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CapturarRecuentoDto,
    @GetUser() user: User,
  ): Promise<DigitarLineaResult> {
    return this.svc.capturarRecuento(id, { lineaId: dto.lineaId, cantidadRecuento: dto.cantidadRecuento }, user.id);
  }

  // ── Transiciones de estado ─────────────────────────────────────────────────

  @Patch(':id/revision')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'en_digitacion → en_revision; bloquea si hay líneas pendientes sin capturar' })
  moverARevision(@Param('id', ParseIntPipe) id: number) {
    return this.svc.moverARevision(id);
  }

  @Patch(':id/ajustar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Aplicar ajustes de stock (solo ADMIN/CONTADOR; no puede ser el capturador)' })
  aplicarAjustes(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: User,
  ): Promise<ConteoInventario> {
    // user.id y user.role vienen del token — nunca del body
    return this.svc.aplicarAjustes(id, user.id, user.role);
  }

  @Patch(':id/cerrar')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'ajustado → cerrado; único lugar donde se escribe fechaCierre' })
  cerrar(
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: User,
  ) {
    return this.svc.cerrar(id, user.id);
  }

  @Patch(':id/anular')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @ApiOperation({ summary: 'Anular conteo (solo desde borrador/en_conteo/en_digitacion/en_revision)' })
  anular(@Param('id', ParseIntPipe) id: number) {
    return this.svc.anular(id);
  }
}
