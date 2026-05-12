import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsEnum, IsNumber, IsInt, IsArray,
  IsPositive, Min, ValidateNested, IsBoolean, IsHexColor,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AtributosProductoService } from './atributos-producto.service';
import { TipoAtributo } from './entities/atributo-producto.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

class ValorDto {
  @IsString()                       valor!:     string;
  @IsOptional() @IsString()         codigo?:    string;
  @IsOptional() @IsString()         colorHex?:  string;
  @IsOptional() @IsInt() @Min(0)    orden?:     number;
}

class CreateAtributoDto {
  @IsString()                           nombre!:  string;
  @IsOptional() @IsEnum(TipoAtributo)   tipo?:    TipoAtributo;
  @IsOptional() @IsString()             unidad?:  string;
  @IsOptional() @IsInt() @Min(0)        orden?:   number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ValorDto)
  valores?: ValorDto[];
}

class AtributoVarianteDto {
  @IsInt() @IsPositive()  atributoId!: number;
  @IsInt() @IsPositive()  valorId!:    number;
}

class CreateVarianteDto {
  @IsInt() @IsPositive()                          productoId!:     number;
  @IsOptional() @IsString()                       sku?:            string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => AtributoVarianteDto)
  atributos!: AtributoVarianteDto[];
  @IsOptional() @IsNumber() @Min(0)               stock?:          number;
  @IsOptional() @IsNumber() @Min(0)               stockMinimo?:    number;
  @IsOptional() @IsNumber() @Min(0)               precioOverride?: number;
}

class GenerarCombsDto {
  @IsArray() atributosConValores!: Array<{
    atributoId: number; nombre: string;
    valores: Array<{ valorId: number; valor: string }>;
  }>;
}

@ApiTags('Atributos & Variantes de Producto')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CONTADOR)
@Controller('atributos-producto')
export class AtributosProductoController {
  constructor(private svc: AtributosProductoService) {}

  // ── Atributos ──────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear atributo (Talla, Color, Material, etc.) con sus valores' })
  crearAtributo(@Body() dto: CreateAtributoDto) { return this.svc.crearAtributo(dto); }

  @Get()
  @ApiOperation({ summary: 'Listar atributos activos con sus valores' })
  getAtributos() { return this.svc.getAtributos(); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de atributo con valores' })
  findAtributo(@Param('id', ParseIntPipe) id: number) { return this.svc.findAtributoById(id); }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar nombre/orden del atributo' })
  updateAtributo(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateAtributoDto) {
    return this.svc.updateAtributo(id, dto as any);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar atributo (soft delete)' })
  deleteAtributo(@Param('id', ParseIntPipe) id: number) { return this.svc.deleteAtributo(id); }

  // ── Valores ────────────────────────────────────────────────────────────────

  @Post(':id/valores')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Agregar valor a un atributo existente' })
  agregarValor(@Param('id', ParseIntPipe) id: number, @Body() dto: ValorDto) {
    return this.svc.agregarValor(id, dto);
  }

  @Delete('valores/:id')
  @ApiOperation({ summary: 'Eliminar valor de atributo' })
  deleteValor(@Param('id', ParseIntPipe) id: number) { return this.svc.deleteValor(id); }

  // ── Variantes ──────────────────────────────────────────────────────────────

  @Post('variantes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear variante de producto (combinación de atributos con stock propio)' })
  crearVariante(@Body() dto: CreateVarianteDto) { return this.svc.crearVariante(dto); }

  @Get('variantes/stock-bajo')
  @ApiOperation({ summary: 'Variantes con stock igual o menor al stock mínimo' })
  getStockBajo() { return this.svc.getVariantesStockBajo(); }

  @Get('variantes/sku/:sku')
  @ApiOperation({ summary: 'Buscar variante por SKU exacto' })
  buscarPorSku(@Param('sku') sku: string) { return this.svc.buscarPorSku(sku); }

  @Get('variantes/producto/:productoId')
  @ApiOperation({ summary: 'Listar variantes de un producto' })
  getVariantes(@Param('productoId', ParseIntPipe) id: number) {
    return this.svc.getVariantesByProducto(id);
  }

  @Patch('variantes/:id')
  @ApiOperation({ summary: 'Actualizar stock, precio o estado de una variante' })
  updateVariante(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateVarianteDto>) {
    return this.svc.updateVariante(id, dto as any);
  }

  @Delete('variantes/:id')
  @ApiOperation({ summary: 'Eliminar variante' })
  deleteVariante(@Param('id', ParseIntPipe) id: number) { return this.svc.deleteVariante(id); }

  @Post('variantes/generar-combinaciones')
  @ApiOperation({ summary: 'Calcular todas las combinaciones posibles de atributos (preview)' })
  generarCombinaciones(@Body() dto: GenerarCombsDto) {
    return { combinaciones: this.svc.generarCombinaciones(dto.atributosConValores) };
  }
}
