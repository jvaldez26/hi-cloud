import {
  Controller, Get, Post, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt, IsPositive, IsBoolean, Min,
} from 'class-validator';
import { UomService } from './uom.service';
import { TipoUnidad } from './entities/unidad-medida.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

class CreateUnidadDto {
  @IsString()                         codigo!:   string;
  @IsString()                         nombre!:   string;
  @IsOptional() @IsString()           simbolo?:  string;
  @IsEnum(TipoUnidad)                 tipo!:     TipoUnidad;
  @IsOptional() @IsBoolean()          esBase?:   boolean;
}

class CreateConversionDto {
  @IsInt() @IsPositive()   unidadDesdeId!: number;
  @IsInt() @IsPositive()   unidadHastaId!: number;
  @IsNumber() @Min(0)      factor!:        number;
}

@ApiTags('Unidades de Medida (UOM)')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('uom')
export class UomController {
  constructor(private svc: UomService) {}

  @Post('inicializar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicializar catálogo de unidades estándar (KG, G, LB, L, ML, M, CM, PZA, DOC...)' })
  inicializar() { return this.svc.inicializarUnidades(); }

  @Get()
  @ApiOperation({ summary: 'Listar unidades de medida activas. Filtrar por tipo' })
  @ApiQuery({ name: 'tipo', required: false })
  getUnidades(@Query('tipo') tipo?: TipoUnidad) { return this.svc.getUnidades(tipo); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear unidad de medida personalizada' })
  crearUnidad(@Body() dto: CreateUnidadDto) { return this.svc.crearUnidad(dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar unidad de medida' })
  deleteUnidad(@Param('id', ParseIntPipe) id: number) { return this.svc.deleteUnidad(id); }

  @Get('conversiones')
  @ApiOperation({ summary: 'Listar conversiones. Filtrar por unidad' })
  @ApiQuery({ name: 'unidadId', required: false })
  getConversiones(@Query('unidadId') unidadId?: string) {
    return this.svc.getConversiones(unidadId ? Number(unidadId) : undefined);
  }

  @Post('conversiones')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear conversión entre dos unidades (ej. 1 KG = 1000 G → factor = 1000)' })
  crearConversion(@Body() dto: CreateConversionDto) { return this.svc.crearConversion(dto); }

  @Delete('conversiones/:id')
  @ApiOperation({ summary: 'Eliminar conversión' })
  deleteConversion(@Param('id', ParseIntPipe) id: number) { return this.svc.deleteConversion(id); }

  @Get('convertir')
  @ApiOperation({ summary: 'Convertir una cantidad entre dos unidades' })
  @ApiQuery({ name: 'cantidad',  required: true, example: 5 })
  @ApiQuery({ name: 'desdeId',   required: true })
  @ApiQuery({ name: 'hastaId',   required: true })
  convertir(
    @Query('cantidad') cantidad: string,
    @Query('desdeId')  desdeId:  string,
    @Query('hastaId')  hastaId:  string,
  ) {
    return this.svc.convertir(Number(cantidad), Number(desdeId), Number(hastaId));
  }
}
